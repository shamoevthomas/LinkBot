"""
Reply checker job — runs every 5 minutes independently of campaign ticks.

Fetches conversations once per LinkedIn user via GraphQL (cached), then
checks all active contacts across every running DM/connection_dm campaign.
"""

import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import (
    Campaign, CampaignAction, CampaignContact, CampaignMessage,
    Contact, User,
)
from app.linkedin_service import get_linkedin_client, check_contact_replied
from app.routers.notifications import create_notification

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {"envoye"} | {f"relance_{i}" for i in range(1, 8)}


def _log_action(db, campaign_id, contact_id, action_type, status, error_message=None):
    db.add(CampaignAction(
        campaign_id=campaign_id,
        contact_id=contact_id,
        action_type=action_type,
        status=status,
        error_message=error_message,
    ))


async def run_reply_checks() -> None:
    """Check replies for all running DM-type campaigns."""
    print("[REPLY CHECKER] tick start", flush=True)
    db = SessionLocal()
    try:
        campaigns = (
            db.query(Campaign)
            .filter(
                Campaign.status == "running",
                Campaign.type.in_(["dm", "connection_dm"]),
            )
            .all()
        )

        if not campaigns:
            print("[REPLY CHECKER] no running DM campaigns", flush=True)
            return

        # Group campaigns by user to reuse the same LinkedIn client
        by_user: dict[int, list[Campaign]] = {}
        for c in campaigns:
            by_user.setdefault(c.user_id, []).append(c)

        for user_id, user_campaigns in by_user.items():
            user = db.query(User).filter(User.id == user_id).first()
            if not user or not user.li_at_cookie or not user.cookies_valid:
                continue

            client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)
            total_detected = 0

            for campaign in user_campaigns:
                active_contacts = (
                    db.query(CampaignContact)
                    .filter(
                        CampaignContact.campaign_id == campaign.id,
                        CampaignContact.status.in_(ACTIVE_STATUSES),
                    )
                    .all()
                )

                for cc in active_contacts:
                    contact = db.query(Contact).filter(Contact.id == cc.contact_id).first()
                    if not contact or not contact.urn_id:
                        continue
                    try:
                        replied = await check_contact_replied(client, contact.urn_id)
                    except Exception:
                        replied = False

                    if replied:
                        cc.status = "reussi"
                        cc.replied_at = datetime.utcnow()
                        campaign.total_succeeded = (campaign.total_succeeded or 0) + 1
                        contact.last_interaction_at = datetime.utcnow()
                        _log_action(db, campaign.id, contact.id, "reply_detected", "success")
                        create_notification(
                            db, campaign.user_id, "reply_received",
                            f"{contact.first_name} {contact.last_name} a repondu",
                            f'Campagne "{campaign.name}"',
                        )
                        total_detected += 1
                        logger.info(
                            "Campaign %d: reply detected from contact %d",
                            campaign.id, contact.id,
                        )

                db.commit()

            print(
                f"[REPLY CHECKER] user {user_id}: {total_detected} replies detected",
                flush=True,
            )

    except Exception:
        logger.exception("Error in reply checker")
    finally:
        db.close()
        print("[REPLY CHECKER] tick done", flush=True)
