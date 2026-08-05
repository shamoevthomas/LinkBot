"""
CRON job to sync new LinkedIn connections into the "Mon Réseau" CRM.

Runs every 6 hours. Compares current connections with existing contacts
and adds any new ones.
"""

import asyncio
import logging

from app.database import SessionLocal
from datetime import datetime, timedelta
from app.models import CRM, Campaign, CampaignAction, CampaignContact, Contact, User
from app.linkedin_service import get_linkedin_client, validate_cookies
from app.routers.notifications import create_notification
from app.scheduler import pause_campaign_job
from app.utils.sync_lock import acquire_lock, release_lock

logger = logging.getLogger(__name__)

# A sync paginates the user's ENTIRE connections list — 1700+ profiles in one
# burst. Run from a datacenter IP six times an hour, which is what an external
# cron set to 5 minutes produces, that reads as scraping and LinkedIn answers by
# revoking the session: the user gets logged out and every campaign stops.
# The interval is enforced here rather than left to whatever schedule the cron
# happens to carry, so no external configuration can put the account at risk.
MIN_SYNC_INTERVAL = timedelta(hours=6)
_LAST_SYNC_SETTING = "last_connections_sync_at"


def _sync_allowed(db, user_id: int, force: bool = False) -> bool:
    """False when the last full sync for this user is too recent."""
    if force or not user_id:
        return True
    from app.utils.settings import get_setting
    raw = get_setting(db, user_id, _LAST_SYNC_SETTING, "") or ""
    if not raw:
        return True
    try:
        last = datetime.fromisoformat(raw)
    except ValueError:
        return True
    age = datetime.utcnow() - last
    if age < MIN_SYNC_INTERVAL:
        print(
            f"[SYNC] User {user_id}: skipped, last sync {int(age.total_seconds() // 60)} min ago "
            f"(minimum {int(MIN_SYNC_INTERVAL.total_seconds() // 3600)}h)",
            flush=True,
        )
        return False
    return True


def _record_sync(user_id: int) -> None:
    """Stamp the sync time in its own transaction.

    Deliberately not the caller's session: the sync body rolls back on error,
    which would erase the stamp and let the next cron tick pull again — the
    throttle would then never hold precisely when syncs are failing.
    """
    if not user_id:
        return
    from app.utils.settings import set_setting
    db = SessionLocal()
    try:
        set_setting(db, user_id, _LAST_SYNC_SETTING, datetime.utcnow().isoformat())
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not record last sync time for user %d", user_id)
    finally:
        db.close()


def _mark_accepted_campaign_contacts(db, connected_urns: set, user_id: int) -> int:
    """Mark campaign_contact records as accepted for newly-connected URNs.

    Two cases handled:
    - 'demande_envoyee' (pure connection campaigns): flip to 'reussi'.
    - 'en_attente' (connection_dm campaigns): keep the status so the
      connection_dm tick still picks the row up to send the DM, but stamp
      connection_accepted_at so the dm_delay_hours gate works.
    """
    if not connected_urns:
        return 0

    # Find contacts with these URNs in the user's CRMs
    user_crm_ids = [r[0] for r in db.query(CRM.id).filter(CRM.user_id == user_id).all()]
    if not user_crm_ids:
        return 0

    contact_ids = set(
        r[0] for r in
        db.query(Contact.id)
        .filter(Contact.crm_id.in_(user_crm_ids), Contact.urn_id.in_(connected_urns))
        .all()
    )
    if not contact_ids:
        return 0

    pending_ccs = db.query(CampaignContact).filter(
        CampaignContact.contact_id.in_(contact_ids),
        CampaignContact.status.in_(("demande_envoyee", "en_attente")),
        CampaignContact.connection_accepted_at.is_(None),
    ).all()

    now = datetime.utcnow()
    for cc in pending_ccs:
        cc.connection_accepted_at = now
        if cc.status == "demande_envoyee":
            cc.status = "reussi"
        # Record it in the campaign journal. Acceptance was only ever logged by
        # connection_dm's phase 1, and only when it discovered the acceptance
        # itself — since this job stamps the timestamp first, that branch never
        # runs and the journal showed nothing between "connection_request" and
        # the DM, as if the invitation had never been accepted.
        db.add(CampaignAction(
            campaign_id=cc.campaign_id,
            contact_id=cc.contact_id,
            action_type="connection_accepted",
            status="success",
        ))

    return len(pending_ccs)


async def sync_new_connections() -> None:
    """Check for new LinkedIn connections for ALL users with valid cookies."""
    print("[SYNC] Starting sync_new_connections for all users", flush=True)
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.cookies_valid == True, User.li_at_cookie.isnot(None)).all()
        for user in users:
            # Proactive cookie validation. Tri-state result:
            #   True  → proceed
            #   False → cookies definitely dead, pause campaigns
            #   None  → transient (redirect glitch / network), skip user this
            #           tick without flipping cookies_valid.
            result = await validate_cookies(user.li_at_cookie, user.jsessionid_cookie)
            if result is None:
                logger.info("Cookies validation transient for user %d, skipping this tick", user.id)
                continue
            if result is False:
                logger.warning("Cookies expired for user %d, pausing campaigns", user.id)
                user.cookies_valid = False
                create_notification(db, user.id, "cookies_expired",
                    "Cookies LinkedIn expires",
                    "Vos cookies LinkedIn ne sont plus valides. Mettez-les a jour dans la configuration.")
                # Pause all running campaigns
                running = db.query(Campaign).filter(
                    Campaign.user_id == user.id, Campaign.status == "running"
                ).all()
                for c in running:
                    c.status = "paused"
                    pause_campaign_job(c.id)
                db.commit()
                continue
            await _sync_user_connections(user.id, user.li_at_cookie, user.jsessionid_cookie)
    finally:
        db.close()


async def _sync_user_connections(user_id: int, li_at: str, jsessionid: str, force: bool = False) -> None:
    """Sync connections for a single user using dedicated connections endpoint."""
    _gate = SessionLocal()
    try:
        if not _sync_allowed(_gate, user_id, force):
            return
    finally:
        _gate.close()

    if not acquire_lock(user_id, "syncing"):
        print(f"[SYNC] User {user_id}: skipped, lock held", flush=True)
        return
    db = SessionLocal()
    try:
        crm = db.query(CRM).filter(CRM.name == "Mon Réseau", CRM.user_id == user_id).first()
        if not crm:
            return
        _record_sync(user_id)

        client = get_linkedin_client(li_at, jsessionid)

        existing_urns = set(
            row[0] for row in
            db.query(Contact.urn_id).filter(Contact.crm_id == crm.id).all()
        )

        # Use dedicated connections endpoint instead of search API
        try:
            all_connections = await asyncio.to_thread(client.get_all_connections)
        except Exception:
            logger.exception("sync_connections: error fetching connections for user %d", user_id)
            return

        total_new = 0
        for person in all_connections:
            person_urn = person.get("urn_id")
            if not person_urn or person_urn in existing_urns:
                continue

            contact = Contact(
                crm_id=crm.id,
                urn_id=person_urn,
                public_id=person.get("public_id"),
                first_name=person.get("first_name", ""),
                last_name=person.get("last_name", ""),
                headline=person.get("jobtitle"),
                location=person.get("location"),
                profile_picture_url=person.get("picture_url"),
                linkedin_url=person.get("navigation_url"),
                connection_status="connected",
            )
            db.add(contact)
            existing_urns.add(person_urn)
            total_new += 1

        all_urns = set(p.get("urn_id") for p in all_connections if p.get("urn_id"))

        # Flip connection_status on contacts that already live in one of the
        # user's CRMs. The loop above only ever *creates* rows in "Mon Réseau",
        # so a prospect sitting in a campaign CRM stayed "pending" forever even
        # after accepting. connection_dm's phase 1 reads exactly this field to
        # decide acceptance, so without this the invitation expired and the
        # contact was marked "perdu" by mistake — acceptance only ever advanced
        # when the user happened to run a manual sync.
        updated = 0
        if all_urns:
            user_crm_ids = [r[0] for r in db.query(CRM.id).filter(CRM.user_id == user_id).all()]
            if user_crm_ids:
                for contact in (
                    db.query(Contact)
                    .filter(
                        Contact.crm_id.in_(user_crm_ids),
                        Contact.urn_id.in_(all_urns),
                        Contact.connection_status != "connected",
                    )
                    .all()
                ):
                    contact.connection_status = "connected"
                    updated += 1

        # Mark accepted connections in campaign tracking
        accepted = _mark_accepted_campaign_contacts(db, all_urns, user_id)

        try:
            db.commit()
        except Exception:
            db.rollback()

        print(
            f"[SYNC] User {user_id}: added {total_new} new connections, "
            f"{updated} statuses updated, {accepted} campaign invitations accepted",
            flush=True,
        )

    except Exception:
        logger.exception("sync_connections: unexpected error for user %d", user_id)
        db.rollback()
    finally:
        release_lock(user_id)
        db.close()


async def sync_and_update_statuses(
    li_at: str, jsessionid: str, user_id: int = None, force: bool = False
) -> None:
    """Manual sync: import new connections to user's 'Mon Réseau' + update statuses across user's CRMs.

    `force` is for the button in Configuration — a person clicking it is not the
    traffic pattern LinkedIn objects to. The external cron does not set it, so
    however often it fires, at most one full pull per MIN_SYNC_INTERVAL runs.
    """
    _gate = SessionLocal()
    try:
        if not _sync_allowed(_gate, user_id, force):
            return
    finally:
        _gate.close()

    if user_id and not acquire_lock(user_id, "syncing"):
        print(f"[SYNC] Manual sync skipped for user {user_id}: lock held", flush=True)
        return
    print(f"[SYNC] Manual sync_and_update_statuses started for user {user_id}", flush=True)
    db = SessionLocal()
    try:
        _record_sync(user_id)
        client = get_linkedin_client(li_at, jsessionid)

        # Step 1: Fetch all connections using dedicated connections endpoint
        try:
            all_connections = await asyncio.to_thread(client.get_all_connections)
        except Exception:
            logger.exception("sync_and_update: error fetching connections")
            all_connections = []

        all_connection_urns = set()
        for person in all_connections:
            person_urn = person.get("urn_id")
            if person_urn:
                all_connection_urns.add(person_urn)

        print(f"[SYNC] Fetched {len(all_connection_urns)} total connections from LinkedIn", flush=True)

        # Step 3: Add new connections to user's "Mon Réseau" CRM
        crm_filter = [CRM.name == "Mon Réseau"]
        if user_id:
            crm_filter.append(CRM.user_id == user_id)
        crm = db.query(CRM).filter(*crm_filter).first()
        total_new = 0
        if crm:
            existing_urns = set(
                row[0] for row in
                db.query(Contact.urn_id).filter(Contact.crm_id == crm.id).all()
            )
            for person in all_connections:
                person_urn = person.get("urn_id")
                if not person_urn or person_urn in existing_urns:
                    continue

                contact = Contact(
                    crm_id=crm.id,
                    urn_id=person_urn,
                    public_id=person.get("public_id"),
                    first_name=person.get("first_name", ""),
                    last_name=person.get("last_name", ""),
                    headline=person.get("jobtitle"),
                    location=person.get("location"),
                    profile_picture_url=person.get("picture_url"),
                    linkedin_url=person.get("navigation_url"),
                    connection_status="connected",
                )
                db.add(contact)
                existing_urns.add(person_urn)
                total_new += 1

            try:
                db.commit()
            except Exception:
                db.rollback()

        # Step 4: Update connection_status across user's CRMs only
        updated = 0
        # Initialised here on purpose: it used to be assigned only inside the
        # `if all_connection_urns:` branch below, so a sync returning no
        # connections — which is exactly what a dead session produces — crashed
        # on the summary line with UnboundLocalError, aborting the whole job.
        accepted = 0
        if all_connection_urns:
            user_crm_ids = [c.id for c in db.query(CRM.id).filter(CRM.user_id == user_id).all()] if user_id else []
            contact_filter = [
                Contact.urn_id.in_(all_connection_urns),
                Contact.connection_status != "connected",
            ]
            if user_crm_ids:
                contact_filter.append(Contact.crm_id.in_(user_crm_ids))
            contacts_to_update = db.query(Contact).filter(*contact_filter).all()
            for contact in contacts_to_update:
                contact.connection_status = "connected"
                updated += 1

            # Mark accepted connections in campaign tracking
            accepted = _mark_accepted_campaign_contacts(db, all_connection_urns, user_id) if user_id else 0
            db.commit()

        print(f"[SYNC] Manual sync done for user {user_id}: {total_new} new, {updated} statuses updated, {accepted} campaign invitations accepted", flush=True)

    except Exception:
        logger.exception("sync_and_update: unexpected error")
        db.rollback()
    finally:
        if user_id:
            release_lock(user_id)
        db.close()
