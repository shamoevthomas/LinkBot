"""
Connection-request campaign job runner.

Called periodically by APScheduler.  Each invocation picks the next
unprocessed contact in the campaign's CRM and sends them a connection
request (optionally with a personalised note).
"""

import asyncio
import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import Campaign, CampaignAction, Contact, AppSettings, User, Blacklist
from app.linkedin_service import get_linkedin_client, send_connection_request, resolve_contact_urn
from app.utils.template_engine import render_template
from app.utils.ai_message import generate_personalized_message
from app.scheduler import cancel_campaign_job, is_within_schedule, get_effective_daily_limit, get_global_actions_today

logger = logging.getLogger(__name__)


async def run_connection_campaign(campaign_id: int) -> None:
    """Send a connection request to the next unprocessed contact."""
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
        raw_limit = int(row.value) if row else 25
        max_per_day = get_effective_daily_limit(raw_limit, db)

        global_today = get_global_actions_today(["connection_request"], db)
        if global_today >= max_per_day:
            logger.info("Global connection limit reached (%d/%d), skipping campaign %d", global_today, max_per_day, campaign_id)
            return

        # --- total target check ---
        if campaign.total_target and campaign.total_processed >= campaign.total_target:
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

        # --- pick next contact ---
        already_requested_ids = (
            db.query(CampaignAction.contact_id)
            .filter(
                CampaignAction.campaign_id == campaign_id,
                CampaignAction.action_type == "connection_request",
                CampaignAction.status.in_(["success", "skipped"]),
            )
            .subquery()
        )

        contact = (
            db.query(Contact)
            .filter(
                Contact.crm_id == campaign.crm_id,
                ~Contact.id.in_(already_requested_ids),
            )
            .order_by(Contact.added_at.asc())
            .first()
        )

        if not contact:
            campaign.status = "completed"
            campaign.completed_at = datetime.utcnow()
            campaign.error_message = "No more contacts to request"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        # --- resolve URN ---
        resolved_urn = await resolve_contact_urn(client, contact)
        if not resolved_urn:
            _log_action(db, campaign.id, contact.id, "connection_request", "failed", "Could not resolve LinkedIn URN")
            campaign.total_processed = (campaign.total_processed or 0) + 1
            campaign.total_failed = (campaign.total_failed or 0) + 1
            db.commit()
            return

        # --- blacklist check ---
        if db.query(Blacklist).filter(Blacklist.urn_id == contact.urn_id).first():
            _log_action(db, campaign.id, contact.id, "connection_request", "skipped", "Blacklisted")
            campaign.total_processed = (campaign.total_processed or 0) + 1
            campaign.total_skipped = (campaign.total_skipped or 0) + 1
            db.commit()
            return

        # --- skip if already connected ---
        if contact.connection_status == "DISTANCE_1":
            _log_action(db, campaign.id, contact.id, "connection_request", "skipped", "Already connected")
            campaign.total_processed = (campaign.total_processed or 0) + 1
            campaign.total_skipped = (campaign.total_skipped or 0) + 1
            db.commit()
            return

        # --- render optional message ---
        message = None
        if campaign.message_template:
            contact_data = {
                "first_name": contact.first_name,
                "last_name": contact.last_name,
                "headline": contact.headline,
                "location": contact.location,
            }
            if campaign.use_ai:
                ai_msg = await asyncio.to_thread(
                    generate_personalized_message, campaign.message_template, contact_data, 300
                )
                message = ai_msg if ai_msg else render_template(campaign.message_template, contact_data)
            else:
                message = render_template(campaign.message_template, contact_data)
            # LinkedIn limits connection request messages to 300 chars
            if len(message) > 300:
                message = message[:297] + "..."

        # --- send connection request ---
        try:
            result = await send_connection_request(client, contact.urn_id, message)
        except Exception as exc:
            logger.exception(
                "Connection request failed for contact %d in campaign %d",
                contact.id, campaign_id,
            )
            _log_action(db, campaign.id, contact.id, "connection_request", "failed", str(exc)[:500])
            campaign.total_processed = (campaign.total_processed or 0) + 1
            campaign.total_failed = (campaign.total_failed or 0) + 1
            db.commit()
            return

        # Update contact status
        invitation_id = None
        if isinstance(result, dict):
            invitation_id = result.get("invitation_id") or result.get("invitationId")

        contact.connection_status = "pending"
        if invitation_id:
            contact.invitation_id = str(invitation_id)
        contact.last_interaction_at = datetime.utcnow()

        _log_action(db, campaign.id, contact.id, "connection_request", "success")
        campaign.total_processed = (campaign.total_processed or 0) + 1
        campaign.total_succeeded = (campaign.total_succeeded or 0) + 1

        # Check completion
        if campaign.total_target and campaign.total_processed >= campaign.total_target:
            campaign.status = "completed"
            campaign.completed_at = datetime.utcnow()
            cancel_campaign_job(campaign_id)

        db.commit()
        logger.info(
            "Campaign %d: connection request sent to contact %d | processed %d/%d",
            campaign_id, contact.id,
            campaign.total_processed, campaign.total_target or 0,
        )

    except Exception:
        logger.exception("Unexpected error in connection campaign %d", campaign_id)
        db.rollback()
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
