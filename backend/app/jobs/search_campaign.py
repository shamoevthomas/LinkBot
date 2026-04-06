"""
Search campaign job runner.

Called periodically by APScheduler.  Each invocation searches LinkedIn
for the campaign's keywords, adds new results to the associated CRM,
and updates counters.  Respects daily limits and stops when the total
target is reached.
"""

import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import Campaign, CampaignAction, Contact, AppSettings, User, Blacklist
from app.linkedin_service import get_linkedin_client, search_people
from app.scheduler import cancel_campaign_job, is_within_schedule, get_effective_daily_limit, get_global_actions_today

logger = logging.getLogger(__name__)

# Batch size for each search invocation.
_BATCH_SIZE = 10


async def run_search_campaign(campaign_id: int) -> None:
    """Execute one search batch for *campaign_id*."""
    print(f"[SEARCH JOB] Campaign {campaign_id}: tick start", flush=True)
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            logger.error("Campaign %d not found, cancelling job", campaign_id)
            cancel_campaign_job(campaign_id)
            return

        if campaign.status != "running":
            return

        # --- schedule window ---
        if not is_within_schedule(db):
            return

        # --- global daily limit check ---
        row = db.query(AppSettings).filter(AppSettings.key == "max_connections_per_day").first()
        raw_limit = int(row.value) if row else 50
        max_per_day = get_effective_daily_limit(raw_limit, db)

        global_today = get_global_actions_today(["search_add"], db)
        if global_today >= max_per_day:
            logger.info("Global search limit reached (%d/%d), skipping campaign %d", global_today, max_per_day, campaign_id)
            return

        # --- total target check ---
        if campaign.total_target and campaign.total_succeeded >= campaign.total_target:
            campaign.status = "completed"
            campaign.completed_at = datetime.utcnow()
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        # --- get LinkedIn client ---
        user = db.query(User).first()
        if not user or not user.li_at_cookie or not user.cookies_valid:
            campaign.status = "failed"
            campaign.error_message = "No valid LinkedIn cookies"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

        # --- perform search ---
        remaining = (campaign.total_target or 50) - (campaign.total_succeeded or 0)
        batch = min(_BATCH_SIZE, remaining, max_per_day - global_today)
        if batch <= 0:
            return

        try:
            results = await search_people(
                client,
                keywords=campaign.keywords or "",
                limit=batch,
                offset=campaign.search_offset or 0,
            )
        except Exception as exc:
            logger.exception("Search failed for campaign %d", campaign_id)
            campaign.status = "failed"
            campaign.error_message = str(exc)[:500]
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        campaign.search_offset = (campaign.search_offset or 0) + len(results)

        if not results:
            campaign.status = "completed"
            campaign.completed_at = datetime.utcnow()
            campaign.error_message = "No more search results"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        # --- insert contacts ---
        added = 0
        skipped = 0
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

            if db.query(Blacklist).filter(Blacklist.urn_id == urn_id).first():
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
                first_name=first_name,
                last_name=last_name,
                headline=person.get("jobtitle"),
                location=person.get("location"),
                linkedin_url=person.get("navigation_url"),
                connection_status=person.get("distance", "unknown"),
            )
            db.add(contact)
            db.flush()

            _log_action(db, campaign.id, contact.id, "search_add", "success")
            added += 1

        campaign.total_processed = (campaign.total_processed or 0) + added + skipped
        campaign.total_succeeded = (campaign.total_succeeded or 0) + added
        campaign.total_skipped = (campaign.total_skipped or 0) + skipped

        # Check completion
        if campaign.total_target and campaign.total_succeeded >= campaign.total_target:
            campaign.status = "completed"
            campaign.completed_at = datetime.utcnow()
            cancel_campaign_job(campaign_id)

        db.commit()
        logger.info(
            "Campaign %d: added %d, skipped %d (total %d/%d)",
            campaign_id, added, skipped,
            campaign.total_succeeded, campaign.total_target or 0,
        )

    except Exception as exc:
        logger.exception("Unexpected error in search campaign %d", campaign_id)
        try:
            db.rollback()
            from app.models import Campaign as _C
            c = db.query(_C).filter(_C.id == campaign_id).first()
            if c:
                from datetime import datetime as _dt
                c.error_message = f"[{_dt.utcnow().strftime('%H:%M:%S')}] {type(exc).__name__}: {str(exc)[:300]}"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _log_action(
    db,
    campaign_id: int,
    contact_id: int | None,
    action_type: str,
    action_status: str,
    error_message: str | None = None,
) -> None:
    db.add(CampaignAction(
        campaign_id=campaign_id,
        contact_id=contact_id,
        action_type=action_type,
        status=action_status,
        error_message=error_message,
    ))
