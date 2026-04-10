"""
Reply checker + follow-up sender — runs every 5 minutes independently of campaign ticks.

1. Fetches conversations once per LinkedIn user via GraphQL (cached)
2. Checks all active contacts across every running DM/connection_dm campaign
3. Sends follow-ups where the delay has been reached (3-7 min spacing between each)
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models import (
    Campaign, CampaignAction, CampaignContact, CampaignMessage,
    Contact, User,
)
from app.linkedin_service import (
    get_linkedin_client, check_contact_replied, send_message,
    get_profile, get_profile_posts, resolve_contact_urn,
)
from app.utils.template_engine import render_template
from app.utils.ai_message import (
    generate_compliment, generate_full_personalized_messages, extract_post_texts,
)
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


async def _render_message(campaign, template, contact, client, api_key=""):
    """Render a message for a contact, using AI if needed."""
    contact_data = {
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "headline": contact.headline,
        "location": contact.location,
    }

    if campaign.full_personalize and campaign.use_ai and api_key:
        profile_data = None
        recent_posts = None
        try:
            profile_data = await get_profile(client, urn_id=contact.urn_id)
        except Exception:
            pass
        try:
            raw_posts = await get_profile_posts(client, urn_id=contact.urn_id, post_count=3)
            recent_posts = extract_post_texts(raw_posts) if raw_posts else None
        except Exception:
            pass

        try:
            msgs = await asyncio.to_thread(
                generate_full_personalized_messages,
                contact_data, profile_data, recent_posts,
                campaign.context_text or "", campaign.ai_prompt or "",
                0, [], api_key,
            )
            if msgs and msgs[0].get("rendered"):
                return msgs[0]["rendered"]
        except Exception as exc:
            logger.warning("AI generation failed for contact %s, falling back to template: %s", contact.urn_id, exc)
        if template and template.strip() != "__FULL_AI__":
            return render_template(template, contact_data)
        return None

    elif campaign.use_ai and api_key and "{compliment}" in template:
        profile_data = None
        recent_posts = None
        try:
            profile_data = await get_profile(client, urn_id=contact.urn_id)
        except Exception:
            pass
        try:
            raw_posts = await get_profile_posts(client, urn_id=contact.urn_id, post_count=3)
            recent_posts = extract_post_texts(raw_posts) if raw_posts else None
        except Exception:
            pass

        try:
            compliment = await asyncio.to_thread(
                generate_compliment, contact_data, profile_data, recent_posts,
                campaign.context_text or "", campaign.ai_prompt or "",
                api_key,
            )
        except Exception as exc:
            logger.warning("AI compliment failed for contact %s, using empty: %s", contact.urn_id, exc)
            compliment = ""
        contact_data["compliment"] = compliment
        if template and template.strip() != "__FULL_AI__":
            return render_template(template, contact_data)
        return None

    else:
        if template and template.strip() != "__FULL_AI__":
            return render_template(template, contact_data)
        return None


async def _send_followup_with_retry(campaign, followup_msg, contact, client, cc, db, api_key=""):
    """Send a follow-up with 3 retries, 1-3 min between attempts.
    Returns True if sent successfully.
    """
    next_seq = cc.last_sequence_sent + 1
    send_ok = False
    last_error = None

    for attempt in range(1, 4):
        try:
            message_body = await _render_message(
                campaign, followup_msg.message_template, contact, client, api_key=api_key
            )
        except Exception as exc:
            last_error = f"Render failed: {exc}"
            message_body = None

        if not message_body or not message_body.strip():
            last_error = last_error or "Empty message"
            # Use per-message fallback if available
            fb = followup_msg.fallback_template if hasattr(followup_msg, 'fallback_template') else None
            if fb and fb.strip():
                contact_data = {
                    "first_name": contact.first_name,
                    "last_name": contact.last_name,
                    "headline": contact.headline,
                    "location": contact.location,
                }
                message_body = render_template(fb, contact_data)
                print(f"[FOLLOWUP] Campaign {campaign.id}: AI failed, using fallback for contact {contact.id}", flush=True)
            else:
                if attempt < 3:
                    delay = random.randint(60, 180)
                    print(f"[FOLLOWUP] Campaign {campaign.id}: attempt {attempt}/3 failed for contact {contact.id}, retry in {delay}s", flush=True)
                    await asyncio.sleep(delay)
                continue

        try:
            success = await send_message(client, contact.urn_id, message_body)
        except Exception as exc:
            last_error = str(exc)[:500]
            success = False

        if success:
            send_ok = True
            break
        else:
            last_error = last_error or "LinkedIn returned error"
            if attempt < 3:
                delay = random.randint(60, 180)
                print(f"[FOLLOWUP] Campaign {campaign.id}: attempt {attempt}/3 failed for contact {contact.id}, retry in {delay}s", flush=True)
                await asyncio.sleep(delay)

    if send_ok:
        cc.last_sequence_sent = next_seq
        cc.last_sent_at = datetime.utcnow()
        cc.status = f"relance_{next_seq}"
        contact.last_interaction_at = datetime.utcnow()
        _log_action(db, campaign.id, contact.id, f"followup_{next_seq}", "success")
        logger.info("Campaign %d: followup %d sent to contact %d", campaign.id, next_seq, contact.id)
    else:
        _log_action(db, campaign.id, contact.id, f"followup_{next_seq}", "failed", f"3 attempts failed: {last_error}")

    db.commit()
    return send_ok


async def run_reply_checks() -> None:
    """Check replies and send due follow-ups for all running DM-type campaigns."""
    print("[REPLY CHECKER] tick start", flush=True)
    db = SessionLocal()
    try:
        # Check running campaigns + recently completed ones (replies can still come in)
        cutoff = datetime.utcnow() - timedelta(days=7)
        from sqlalchemy import or_, and_
        campaigns = (
            db.query(Campaign)
            .filter(
                Campaign.type.in_(["dm", "connection_dm", "search_connection_dm"]),
                or_(
                    Campaign.status == "running",
                    and_(Campaign.status == "completed", Campaign.completed_at >= cutoff),
                ),
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
            total_followups_sent = 0

            for campaign in user_campaigns:
                # =============================================================
                # PART 1: Check replies for active contacts
                # =============================================================
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

                # =============================================================
                # PART 2: Send follow-ups where delay has been reached
                # (skip for completed campaigns — only reply detection)
                # =============================================================
                if campaign.status == "completed":
                    continue

                followups = (
                    db.query(CampaignMessage)
                    .filter(CampaignMessage.campaign_id == campaign.id, CampaignMessage.sequence > 0)
                    .order_by(CampaignMessage.sequence)
                    .all()
                )
                if not followups:
                    continue

                max_followup_seq = max(f.sequence for f in followups)

                due_contacts = (
                    db.query(CampaignContact)
                    .filter(
                        CampaignContact.campaign_id == campaign.id,
                        CampaignContact.status.in_(ACTIVE_STATUSES),
                        CampaignContact.last_sequence_sent < max_followup_seq,
                    )
                    .order_by(CampaignContact.last_sent_at.asc())
                    .all()
                )

                for cc in due_contacts:
                    next_seq = cc.last_sequence_sent + 1
                    followup_msg = next((f for f in followups if f.sequence == next_seq), None)
                    if not followup_msg:
                        continue

                    # Check if enough time has passed since last send
                    delay = timedelta(days=followup_msg.delay_days)
                    if cc.last_sent_at and datetime.utcnow() - cc.last_sent_at < delay:
                        continue

                    contact = db.query(Contact).filter(Contact.id == cc.contact_id).first()
                    if not contact or not contact.urn_id:
                        continue

                    # Skip if contact already replied (detected in Part 1)
                    if cc.status == "reussi":
                        continue

                    # Check reply one more time right before sending
                    try:
                        replied = await check_contact_replied(client, contact.urn_id)
                    except Exception:
                        replied = False
                    if replied:
                        cc.status = "reussi"
                        cc.replied_at = datetime.utcnow()
                        campaign.total_succeeded = (campaign.total_succeeded or 0) + 1
                        _log_action(db, campaign.id, contact.id, "reply_detected", "success")
                        create_notification(
                            db, campaign.user_id, "reply_received",
                            f"{contact.first_name} {contact.last_name} a repondu",
                            f'Campagne "{campaign.name}"',
                        )
                        db.commit()
                        continue

                    # Space follow-ups 3-7 min apart
                    if total_followups_sent > 0:
                        spacing = random.randint(180, 420)
                        print(f"[FOLLOWUP] Spacing {spacing}s before next follow-up", flush=True)
                        await asyncio.sleep(spacing)

                    # Send with retry
                    ok = await _send_followup_with_retry(campaign, followup_msg, contact, client, cc, db, api_key=user.gemini_api_key or "")
                    if ok:
                        total_followups_sent += 1

            print(
                f"[REPLY CHECKER] user {user_id}: {total_detected} replies, {total_followups_sent} follow-ups sent",
                flush=True,
            )

    except Exception:
        logger.exception("Error in reply checker")
    finally:
        db.close()
        print("[REPLY CHECKER] tick done", flush=True)
