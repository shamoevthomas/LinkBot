"""
Search campaign job runner.

Searches LinkedIn for the campaign's keywords, adds all results to the
associated CRM, and completes immediately.  No tick-based batching —
the entire search runs in one go.
"""

import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import Campaign, CampaignAction, Contact, User, Blacklist
from app.linkedin_service import get_linkedin_client, search_people
from app.scheduler import cancel_campaign_job
from app.routers.notifications import create_notification

logger = logging.getLogger(__name__)

# LinkedIn returns max 10 per page
_PAGE_SIZE = 10


async def run_search_campaign(campaign_id: int) -> None:
    """Search LinkedIn and import all results into the CRM at once."""
    print(f"[SEARCH JOB] Campaign {campaign_id}: starting full search", flush=True)
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            logger.error("Campaign %d not found, cancelling job", campaign_id)
            cancel_campaign_job(campaign_id)
            return

        if campaign.status != "running":
            return

        # --- get LinkedIn client ---
        user = db.query(User).filter(User.id == campaign.user_id).first()
        if not user or not user.li_at_cookie or not user.cookies_valid:
            campaign.status = "failed"
            campaign.error_message = "No valid LinkedIn cookies"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

        target = campaign.total_target or 50
        offset = campaign.search_offset or 0
        added = 0
        skipped = 0

        # Loop through pages until we reach target or exhaust results
        while added < target:
            batch = min(_PAGE_SIZE, target - added)
            try:
                results = await search_people(
                    client,
                    keywords=campaign.keywords or "",
                    limit=batch,
                    offset=offset,
                )
            except Exception as exc:
                logger.exception("Search failed for campaign %d at offset %d", campaign_id, offset)
                campaign.error_message = f"Search error at offset {offset}: {str(exc)[:300]}"
                # Keep what we found so far, don't fail the whole campaign
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

                if db.query(Blacklist).filter(Blacklist.urn_id == urn_id, Blacklist.user_id == campaign.user_id).first():
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

        # Update counters and complete
        campaign.search_offset = offset
        campaign.total_processed = (campaign.total_processed or 0) + added + skipped
        campaign.total_succeeded = (campaign.total_succeeded or 0) + added
        campaign.total_skipped = (campaign.total_skipped or 0) + skipped
        campaign.status = "completed"
        campaign.completed_at = datetime.utcnow()
        db.commit()

        cancel_campaign_job(campaign_id)
        create_notification(
            db, campaign.user_id, "campaign_completed",
            f'Recherche "{campaign.name}" terminee',
            f"{added} contact(s) ajoute(s), {skipped} ignore(s)",
        )
        db.commit()

        logger.info(
            "Campaign %d completed: added %d, skipped %d",
            campaign_id, added, skipped,
        )
        print(f"[SEARCH JOB] Campaign {campaign_id}: done — {added} added, {skipped} skipped", flush=True)

    except Exception as exc:
        logger.exception("Unexpected error in search campaign %d", campaign_id)
        try:
            db.rollback()
            from app.models import Campaign as _C
            c = db.query(_C).filter(_C.id == campaign_id).first()
            if c:
                c.error_message = f"[{datetime.utcnow().strftime('%H:%M:%S')}] {type(exc).__name__}: {str(exc)[:300]}"
                c.status = "completed"
                c.completed_at = datetime.utcnow()
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
