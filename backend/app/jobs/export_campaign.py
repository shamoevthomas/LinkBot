"""
Export campaign job runner.

Copies contacts from a source CRM to a destination CRM, filtered by a
keyword matched case-insensitively against the contact's name, headline,
and location. Runs in one tick and completes immediately (no LinkedIn
API calls). Duplicates (same urn_id already in destination) are skipped.
"""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import or_, func

from app.database import SessionLocal
from app.models import Campaign, CampaignAction, Contact, CRM
from app.scheduler import cancel_campaign_job
from app.routers.notifications import create_notification

logger = logging.getLogger(__name__)


async def run_export_campaign(campaign_id: int) -> None:
    """Copy matching contacts from source CRM to destination CRM in one pass."""
    print(f"[EXPORT JOB] Campaign {campaign_id}: starting", flush=True)
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            logger.error("Campaign %d not found, cancelling job", campaign_id)
            cancel_campaign_job(campaign_id)
            return

        if campaign.status != "running":
            return

        if not campaign.source_crm_id or not campaign.crm_id:
            campaign.status = "failed"
            campaign.error_message = "Missing source or destination CRM"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        # Validate both CRMs belong to the user
        source_crm = db.query(CRM).filter(
            CRM.id == campaign.source_crm_id,
            CRM.user_id == campaign.user_id,
        ).first()
        dest_crm = db.query(CRM).filter(
            CRM.id == campaign.crm_id,
            CRM.user_id == campaign.user_id,
        ).first()
        if not source_crm or not dest_crm:
            campaign.status = "failed"
            campaign.error_message = "Source or destination CRM not found"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        keyword = (campaign.keywords or "").strip()
        if not keyword:
            campaign.status = "failed"
            campaign.error_message = "Keyword is required for export campaigns"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        pattern = f"%{keyword.lower()}%"

        matching = db.query(Contact).filter(
            Contact.crm_id == campaign.source_crm_id,
            Contact.deleted_at.is_(None),
            or_(
                func.lower(func.coalesce(Contact.first_name, "")).like(pattern),
                func.lower(func.coalesce(Contact.last_name, "")).like(pattern),
                func.lower(func.coalesce(Contact.headline, "")).like(pattern),
                func.lower(func.coalesce(Contact.location, "")).like(pattern),
            ),
        ).all()

        print(
            f"[EXPORT JOB] Campaign {campaign_id}: {len(matching)} contact(s) match keyword "
            f"{keyword!r} in source CRM {campaign.source_crm_id}",
            flush=True,
        )

        # Existing urn_ids in destination — single query to avoid N+1
        existing_urns = {
            row[0] for row in db.query(Contact.urn_id).filter(
                Contact.crm_id == campaign.crm_id
            ).all()
        }

        added = 0
        skipped = 0

        for src in matching:
            if not src.urn_id:
                skipped += 1
                _log_action(db, campaign.id, None, "export_copy", "skipped", "No urn_id")
                continue

            if src.urn_id in existing_urns:
                skipped += 1
                _log_action(db, campaign.id, src.id, "export_copy", "skipped", "Already in destination")
                continue

            new_contact = Contact(
                crm_id=campaign.crm_id,
                urn_id=src.urn_id,
                public_id=src.public_id,
                first_name=src.first_name,
                last_name=src.last_name,
                headline=src.headline,
                location=src.location,
                profile_picture_url=src.profile_picture_url,
                linkedin_url=src.linkedin_url,
                connection_status=src.connection_status or "unknown",
                notes=src.notes,
            )
            db.add(new_contact)
            db.flush()

            existing_urns.add(src.urn_id)
            _log_action(db, campaign.id, new_contact.id, "export_copy", "success")
            added += 1

        campaign.total_target = len(matching)
        campaign.total_processed = added + skipped
        campaign.total_succeeded = added
        campaign.total_skipped = skipped
        campaign.status = "completed"
        campaign.completed_at = datetime.utcnow()
        db.commit()

        cancel_campaign_job(campaign_id)
        create_notification(
            db, campaign.user_id, "campaign_completed",
            f'Export "{campaign.name}" termine',
            f"{added} contact(s) copie(s) de \"{source_crm.name}\" vers \"{dest_crm.name}\", {skipped} ignore(s)",
        )
        db.commit()

        print(f"[EXPORT JOB] Campaign {campaign_id}: done — {added} copied, {skipped} skipped", flush=True)

    except Exception as exc:
        logger.exception("Unexpected error in export campaign %d", campaign_id)
        try:
            db.rollback()
            c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            if c:
                c.error_message = f"[{datetime.now(ZoneInfo('Europe/Paris')).strftime('%H:%M:%S')}] {type(exc).__name__}: {str(exc)[:300]}"
                c.status = "failed"
                c.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
        cancel_campaign_job(campaign_id)
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
