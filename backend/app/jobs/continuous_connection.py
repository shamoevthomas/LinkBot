"""
Continuous Connection tick.

For every user with an enabled ContinuousConnection config, if their daily
connection quota is not consumed by their running connection campaigns, fire
a single plain (note-less) connection request to a random LinkedIn profile
matching the configured keywords + regions.

Called every few minutes from scheduler._main_loop. One firing per user per
tick; the outer schedule paces the throughput to look human.
"""

import asyncio
import json
import logging
import random
from datetime import datetime, date

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import (
    User, CRM, Contact, Campaign, CampaignAction, CampaignContact, Blacklist,
    ContinuousConnection,
)
from app.linkedin_service import (
    get_linkedin_client, search_people, send_connection_request, resolve_geo_urn,
    is_dead_cookie_error, mark_cookies_invalid,
)
from app.utils.rate_limit_cooldown import is_in_cooldown, trigger_connections_cooldown

logger = logging.getLogger(__name__)

# Result-set randomization window: pick a random result within the first N
# so the picks feel varied but stay relevant to the keyword.
_RANDOM_POOL_SIZE = 25

# Connection-type campaign types that "own" the daily quota when they still
# have contacts to process. When any of these has pending work, the continuous
# module yields to it.
_CONNECTION_CAMPAIGN_TYPES = ("connection", "connection_dm", "search_connection_dm")


def _parse_json_list(raw):
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return [str(x) for x in v] if isinstance(v, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _has_active_connection_work(db, user_id: int) -> bool:
    """True if any running connection-type campaign still has contacts to process.

    We yield to campaigns rather than eating their quota out from under them.
    A campaign is "still working" when total_processed < total_target.
    """
    q = (
        db.query(Campaign)
        .filter(
            Campaign.user_id == user_id,
            Campaign.status == "running",
            Campaign.type.in_(_CONNECTION_CAMPAIGN_TYPES),
        )
    )
    for c in q.all():
        target = c.total_target or 0
        processed = c.total_processed or 0
        if target == 0 or processed < target:
            return True
    return False


def _load_excluded_urns(db, user_id: int) -> set:
    """Same exclusion set as search_campaign.exclude_connected: 1st-degree
    connections + Linky-sent pending invitations across all the user's CRMs."""
    user_crm_ids = [r[0] for r in db.query(CRM.id).filter(CRM.user_id == user_id).all()]
    if not user_crm_ids:
        return set()
    connected = db.query(Contact.urn_id).filter(
        Contact.crm_id.in_(user_crm_ids),
        Contact.urn_id.isnot(None),
        Contact.connection_status == "DISTANCE_1",
    ).all()
    pending = (
        db.query(Contact.urn_id)
        .join(CampaignContact, CampaignContact.contact_id == Contact.id)
        .join(Campaign, CampaignContact.campaign_id == Campaign.id)
        .filter(
            Campaign.user_id == user_id,
            CampaignContact.status.in_(("demande_envoyee", "en_attente")),
            Contact.urn_id.isnot(None),
        )
        .all()
    )
    return {r[0] for r in connected} | {r[0] for r in pending}


def _log_action(db, cc_id, contact_id, action_type, status_val, error_message=None):
    db.add(CampaignAction(
        campaign_id=None,
        lead_magnet_id=None,
        continuous_connection_id=cc_id,
        contact_id=contact_id,
        action_type=action_type,
        status=status_val,
        error_message=error_message,
    ))


async def _resolve_regions(user, region_names: list[str]) -> list[str]:
    """Resolve free-text location names to LinkedIn geoUrn IDs.

    Numeric strings are kept as-is (legacy geoUrn); names that don't resolve are
    dropped. If NONE resolve, we return an empty list and the search runs
    unfiltered by region — same behavior as the search campaign's partial-fail path.
    """
    out: list[str] = []
    for loc in region_names:
        if not loc:
            continue
        if loc.isdigit():
            out.append(loc)
            continue
        urn = await asyncio.to_thread(
            resolve_geo_urn, loc, user.li_at_cookie, user.jsessionid_cookie or ""
        )
        if urn:
            out.append(urn)
    return out


async def _tick_one_user(cfg_id: int) -> None:
    """Run one tick for one user's continuous connection config."""
    # Deferred imports to avoid a circular with scheduler.
    from app.scheduler import is_within_schedule, get_effective_daily_limit, get_user_actions_today
    from app.utils.settings import get_setting

    db = SessionLocal()
    try:
        cfg = db.query(ContinuousConnection).filter(ContinuousConnection.id == cfg_id).first()
        if not cfg or not cfg.enabled:
            return

        user = db.query(User).filter(User.id == cfg.user_id).first()
        if not user or not user.li_at_cookie or not user.cookies_valid:
            cfg.last_error = "Cookies LinkedIn invalides"
            db.commit()
            return

        # Schedule window (per-user).
        if not is_within_schedule(user.id, db):
            return

        # Rate-limit cooldown (per-user, connections family). If active, wait.
        if is_in_cooldown(db, "connections", user.id):
            return

        # Daily quota check — count campaign actions + our own actions today.
        raw_limit = int(get_setting(db, user.id, "max_connections_per_day", "25") or "25")
        max_per_day = get_effective_daily_limit(raw_limit, user.id, db)
        today = get_user_actions_today(["connection_request"], user.id, db)
        if today >= max_per_day:
            return

        # Yield to running connection campaigns that still have work to do.
        if _has_active_connection_work(db, user.id):
            return

        keywords_list = _parse_json_list(cfg.keywords)
        if not keywords_list:
            return
        regions_list = _parse_json_list(cfg.search_regions)

        # Refresh the destination CRM handle (auto-create if missing).
        if not cfg.crm_id:
            crm = CRM(name="Connexion Continue", description="Contacts capturés automatiquement par la Connexion Continue", user_id=user.id)
            db.add(crm)
            db.commit()
            db.refresh(crm)
            cfg.crm_id = crm.id
            db.commit()

        keyword = random.choice(keywords_list)
        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

        # Resolve regions to geoUrns.
        resolved_geos = await _resolve_regions(user, regions_list) if regions_list else []

        # Search: random offset within a modest window so we don't hit the same
        # first-page results every single tick.
        offset = random.randint(0, 40)
        try:
            results = await search_people(
                client,
                keywords=keyword,
                limit=_RANDOM_POOL_SIZE,
                offset=offset,
                regions=resolved_geos or None,
            )
        except Exception as exc:
            if is_dead_cookie_error(exc):
                mark_cookies_invalid(user.id)
                cfg.enabled = False
                cfg.last_error = "Cookies LinkedIn morts — reconnecte-toi puis réactive."
                db.commit()
                return
            cfg.last_error = f"Erreur recherche: {str(exc)[:200]}"
            db.commit()
            return

        if not results:
            return

        excluded = _load_excluded_urns(db, user.id)
        blacklisted_urns = {
            r[0] for r in db.query(Blacklist.urn_id).filter(Blacklist.user_id == user.id).all()
        }
        # Filter: valid urn, not 1st-degree, not already-known, not blacklisted,
        # not already in destination CRM (dedupe).
        already_in_crm = {
            r[0] for r in db.query(Contact.urn_id).filter(Contact.crm_id == cfg.crm_id).all()
        }
        pool = []
        for p in results:
            urn = p.get("urn_id")
            if not urn:
                continue
            if p.get("distance") == "DISTANCE_1":
                continue
            if urn in excluded or urn in blacklisted_urns or urn in already_in_crm:
                continue
            pool.append(p)

        if not pool:
            return

        # Pick one at random for a human-looking selection.
        person = random.choice(pool)
        urn_id = person["urn_id"]
        name = person.get("name", "") or ""
        parts = name.split(" ", 1)
        first_name = parts[0] if parts else ""
        last_name = parts[1] if len(parts) > 1 else ""

        # Create the local Contact row first so failed actions still have a target.
        contact = Contact(
            crm_id=cfg.crm_id,
            urn_id=urn_id,
            public_id=person.get("public_id"),
            first_name=first_name,
            last_name=last_name,
            headline=person.get("jobtitle"),
            location=person.get("location"),
            profile_picture_url=person.get("picture_url"),
            linkedin_url=person.get("navigation_url"),
            connection_status="pending",
        )
        db.add(contact)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            return

        # Fire the invitation (no note).
        try:
            await send_connection_request(client, urn_id, None)
        except Exception as exc:
            err_text = str(exc)
            _log_action(db, cfg.id, contact.id, "connection_request", "failed", err_text[:500])
            if "FUSE_LIMIT_EXCEEDED" in err_text or "status code 429" in err_text:
                until = trigger_connections_cooldown(db, user.id)
                logger.warning(
                    "ContinuousConnection user=%s: FUSE_LIMIT_EXCEEDED, cooldown until %s",
                    user.id, until.isoformat(),
                )
            elif is_dead_cookie_error(exc):
                mark_cookies_invalid(user.id)
                cfg.enabled = False
                cfg.last_error = "Cookies LinkedIn morts — reconnecte-toi puis réactive."
            else:
                cfg.last_error = f"Envoi échoué: {err_text[:200]}"
            cfg.last_run_at = datetime.utcnow()
            db.commit()
            return

        # Success path.
        _log_action(db, cfg.id, contact.id, "connection_request", "success")
        cfg.total_sent = (cfg.total_sent or 0) + 1
        cfg.last_run_at = datetime.utcnow()
        cfg.last_error = None
        db.commit()
        print(
            f"[CONTINUOUS_CONN] user={user.id} keyword={keyword!r} sent to {urn_id} "
            f"({today + 1}/{max_per_day} today)",
            flush=True,
        )

    except Exception:
        logger.exception("ContinuousConnection tick failed for cfg %d", cfg_id)
    finally:
        db.close()


async def run_continuous_connection() -> None:
    """Tick every enabled config once. Called by the scheduler side-jobs loop."""
    db = SessionLocal()
    try:
        cfg_ids = [
            r[0]
            for r in db.query(ContinuousConnection.id)
            .filter(ContinuousConnection.enabled == True)  # noqa: E712
            .all()
        ]
    finally:
        db.close()

    for cfg_id in cfg_ids:
        try:
            await _tick_one_user(cfg_id)
        except Exception:
            logger.exception("Error in continuous_connection tick for cfg %d", cfg_id)
