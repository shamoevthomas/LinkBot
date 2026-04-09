"""
Search + Connection + DM pipeline campaign job runner.

Flow:
1. First tick: search LinkedIn for keywords, import contacts to CRM
2. Subsequent ticks: delegate to connection_dm_campaign (send connection
   requests, wait for acceptance, send DMs + follow-ups)

Uses campaign.search_offset as a phase marker:
- 0 (default) + keywords present = search not started yet
- -1 = search completed, now in connection+DM phase
"""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from app.database import SessionLocal
from app.models import Campaign, CampaignAction, Contact, User, Blacklist
from app.linkedin_service import get_linkedin_client, search_people
from app.scheduler import cancel_campaign_job

logger = logging.getLogger(__name__)

_PAGE_SIZE = 10


async def run_search_connection_dm_campaign(campaign_id: int) -> None:
    """Run one tick of a search+connection+DM campaign."""
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            cancel_campaign_job(campaign_id)
            return
        if campaign.status != "running":
            return

        needs_search = (campaign.search_offset or 0) == 0 and campaign.keywords
    finally:
        db.close()

    if needs_search:
        await _run_search_phase(campaign_id)
        return

    # Search done -- delegate to connection_dm logic
    from app.jobs.connection_dm_campaign import run_connection_dm_campaign
    await run_connection_dm_campaign(campaign_id)


async def _run_search_phase(campaign_id: int) -> None:
    """Run the search phase: find contacts on LinkedIn and add to CRM."""
    print(f"[SEARCH_CONN_DM JOB] Campaign {campaign_id}: running search phase", flush=True)
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign or campaign.status != "running":
            return

        user = db.query(User).filter(User.id == campaign.user_id).first()
        if not user or not user.li_at_cookie or not user.cookies_valid:
            campaign.status = "failed"
            campaign.error_message = "No valid LinkedIn cookies"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

        target = campaign.total_target or 50
        offset = 0
        added = 0
        skipped = 0
        regions = campaign.search_regions.split(",") if campaign.search_regions else None

        while added < target:
            batch = min(_PAGE_SIZE, target - added)
            try:
                results = await search_people(
                    client,
                    keywords=campaign.keywords or "",
                    limit=batch,
                    offset=offset,
                    regions=regions,
                )
            except Exception as exc:
                logger.exception("Search failed for campaign %d at offset %d", campaign_id, offset)
                campaign.error_message = f"Search error at offset {offset}: {str(exc)[:300]}"
                break

            if not results:
                break

            offset += len(results)

            for person in results:
                urn_id = person.get("urn_id")
                if not urn_id:
                    skipped += 1
                    _log_action(db, campaign.id, None, "search_add", "skipped", "No urn_id in result")
                    continue

                existing = db.query(Contact).filter(
                    Contact.crm_id == campaign.crm_id,
                    Contact.urn_id == urn_id,
                ).first()

                if existing:
                    skipped += 1
                    _log_action(db, campaign.id, existing.id, "search_add", "skipped", "Duplicate")
                    continue

                if db.query(Blacklist).filter(
                    Blacklist.urn_id == urn_id,
                    Blacklist.user_id == campaign.user_id,
                ).first():
                    skipped += 1
                    _log_action(db, campaign.id, None, "search_add", "skipped", "Blacklisted")
                    continue

                name = person.get("name", "") or ""
                parts = name.split(" ", 1)
                first_name = parts[0] if parts else ""
                last_name = parts[1] if len(parts) > 1 else ""

                contact = Contact(
                    crm_id=campaign.crm_id,
                    urn_id=urn_id,
                    public_id=person.get("public_id"),
                    first_name=first_name,
                    last_name=last_name,
                    headline=person.get("jobtitle"),
                    location=person.get("location"),
                    profile_picture_url=person.get("picture_url"),
                    linkedin_url=person.get("navigation_url"),
                    connection_status=person.get("distance", "unknown"),
                )
                db.add(contact)
                db.flush()

                _log_action(db, campaign.id, contact.id, "search_add", "success")
                added += 1

                if added >= target:
                    break

        # Mark search phase as done (-1 = completed)
        campaign.search_offset = -1
        # Update total_target to the actual CRM contact count (for connection+DM phase)
        crm_count = db.query(Contact).filter(Contact.crm_id == campaign.crm_id).count()
        if crm_count > 0:
            campaign.total_target = crm_count
        db.commit()

        print(
            f"[SEARCH_CONN_DM JOB] Campaign {campaign_id}: search done -- "
            f"{added} added, {skipped} skipped. Now entering connection+DM phase.",
            flush=True,
        )

    except Exception as exc:
        logger.exception("Unexpected error in search phase of campaign %d", campaign_id)
        try:
            db.rollback()
            c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            if c:
                c.error_message = (
                    f"[{datetime.now(ZoneInfo('Europe/Paris')).strftime('%H:%M:%S')}] "
                    f"{type(exc).__name__}: {str(exc)[:300]}"
                )
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _log_action(db, campaign_id, contact_id, action_type, status, error_message=None):
    db.add(CampaignAction(
        campaign_id=campaign_id,
        contact_id=contact_id,
        action_type=action_type,
        status=status,
        error_message=error_message,
    ))
