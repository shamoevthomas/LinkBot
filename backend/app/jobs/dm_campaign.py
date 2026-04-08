"""
DM (Direct Message) campaign job runner with follow-up cycle.

Each tick:
1. Check replies for active contacts (batch of 5)
2. Send follow-ups where delay has been reached
3. Send main message to next unprocessed contact
4. Mark contacts as "perdu" when all follow-ups exhausted
5. Complete campaign when all contacts have final status
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models import (
    Campaign, CampaignAction, CampaignContact, CampaignMessage,
    Contact, AppSettings, User, Blacklist,
)
from app.linkedin_service import (
    get_linkedin_client, send_message, get_profile, get_profile_posts,
    check_contact_replied, resolve_contact_urn,
)
from app.utils.template_engine import render_template
from app.utils.ai_message import (
    generate_compliment, generate_full_personalized_messages, extract_post_texts,
)
from app.scheduler import cancel_campaign_job, is_within_schedule, get_effective_daily_limit, get_global_actions_today
from app.routers.notifications import create_notification

logger = logging.getLogger(__name__)

# Statuses that mean "still in the follow-up cycle"
ACTIVE_STATUSES = {"envoye"} | {f"relance_{i}" for i in range(1, 8)}
FINAL_STATUSES = {"reussi", "perdu"}


async def run_dm_campaign(campaign_id: int) -> None:
    print(f"[DM JOB] Campaign {campaign_id}: tick start", flush=True)
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            cancel_campaign_job(campaign_id)
            return
        if campaign.status != "running":
            return

        # --- schedule window ---
        if not is_within_schedule(db):
            return

        # --- global daily limit ---
        row = db.query(AppSettings).filter(AppSettings.key == "max_dms_per_day").first()
        raw_limit = int(row.value) if row else 50
        max_per_day = get_effective_daily_limit(raw_limit, db)

        dm_action_types = ["dm_send"]
        global_today = get_global_actions_today(dm_action_types, db)

        # --- get LinkedIn client (from campaign owner) ---
        user = db.query(User).filter(User.id == campaign.user_id).first()
        if not user or not user.li_at_cookie or not user.cookies_valid:
            campaign.status = "failed"
            campaign.error_message = "No valid LinkedIn cookies"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

        # --- get follow-up config ---
        followups = (
            db.query(CampaignMessage)
            .filter(CampaignMessage.campaign_id == campaign_id, CampaignMessage.sequence > 0)
            .order_by(CampaignMessage.sequence)
            .all()
        )
        max_followup_seq = max((f.sequence for f in followups), default=0)

        # NOTE: Reply checking + follow-up sends moved to reply_checker.py (runs every 5 min)

        # =====================================================================
        # PHASE 1: Mark "perdu" - contacts with all follow-ups sent + delay passed
        # =====================================================================
        if max_followup_seq > 0:
            last_followup = followups[-1] if followups else None
            grace_delay = timedelta(days=last_followup.delay_days if last_followup else 3)

            perdus = (
                db.query(CampaignContact)
                .filter(
                    CampaignContact.campaign_id == campaign_id,
                    CampaignContact.status.in_(ACTIVE_STATUSES),
                    CampaignContact.last_sequence_sent >= max_followup_seq,
                )
                .all()
            )
            for cc in perdus:
                if cc.last_sent_at and datetime.utcnow() - cc.last_sent_at >= grace_delay:
                    cc.status = "perdu"
                    _log_action(db, campaign_id, cc.contact_id, "marked_lost", "success")
                    logger.info("Campaign %d: contact %d marked perdu", campaign_id, cc.contact_id)
            db.commit()
        else:
            # No follow-ups configured: contacts with no reply after grace period
            grace_delay = timedelta(days=3)
            for cc in (
                db.query(CampaignContact)
                .filter(
                    CampaignContact.campaign_id == campaign_id,
                    CampaignContact.status == "envoye",
                )
                .all()
            ):
                if cc.last_sent_at and datetime.utcnow() - cc.last_sent_at >= grace_delay:
                    cc.status = "perdu"
            db.commit()

        # =====================================================================
        # PHASE 4: Send main message to next unprocessed contact
        # =====================================================================
        while get_global_actions_today(dm_action_types, db) < max_per_day:
            total_sent = db.query(CampaignContact).filter(
                CampaignContact.campaign_id == campaign_id
            ).count()

            if campaign.total_target and total_sent >= campaign.total_target:
                break

            already_ids = (
                db.query(CampaignContact.contact_id)
                .filter(CampaignContact.campaign_id == campaign_id)
                .subquery()
            )
            contact = (
                db.query(Contact)
                .filter(
                    Contact.crm_id == campaign.crm_id,
                    ~Contact.id.in_(already_ids),
                )
                .order_by(Contact.added_at.asc())
                .first()
            )

            if not contact:
                break

            # Skip if already in this campaign (race condition guard)
            already = db.query(CampaignContact).filter(
                CampaignContact.campaign_id == campaign_id,
                CampaignContact.contact_id == contact.id,
            ).first()
            if already:
                continue

            # Blacklist check — skip and continue immediately
            if db.query(Blacklist).filter(Blacklist.urn_id == contact.urn_id, Blacklist.user_id == campaign.user_id).first():
                _log_action(db, campaign_id, contact.id, "dm_send", "skipped", "Blacklisted")
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_skipped = (campaign.total_skipped or 0) + 1
                # Mark in CampaignContact so it won't be picked again
                db.add(CampaignContact(
                    campaign_id=campaign_id, contact_id=contact.id,
                    status="perdu", last_sequence_sent=0,
                    main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                ))
                db.commit()
                continue

            # Resolve URN if missing or potentially invalid
            resolved_urn = await resolve_contact_urn(client, contact)
            if not resolved_urn:
                _log_action(db, campaign_id, contact.id, "dm_send", "failed", "Could not resolve LinkedIn URN")
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_failed = (campaign.total_failed or 0) + 1
                db.add(CampaignContact(
                    campaign_id=campaign_id, contact_id=contact.id,
                    status="perdu", last_sequence_sent=0,
                    main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                ))
                db.commit()
                continue

            template = campaign.message_template or ""

            # Retry up to 3 times with 1-3 min intervals
            send_ok = False
            last_error = None
            _skip_no_perdu = False  # True = AI temporarily down, skip without marking perdu
            for attempt in range(1, 4):
                try:
                    message_body = await _render_message(campaign, template, contact, client)
                except Exception as exc:
                    last_error = f"Render failed: {exc}"
                    message_body = None

                if not message_body or not message_body.strip():
                    last_error = last_error or "Empty message (AI generation failed)"
                    # For full_personalize with no template fallback, AI is likely down — skip, don't burn retries
                    if campaign.full_personalize and campaign.use_ai:
                        print(f"[DM JOB] Campaign {campaign_id}: AI unavailable for contact {contact.id}, skipping (will retry next tick)", flush=True)
                        _skip_no_perdu = True
                        break
                    if attempt < 3:
                        delay = random.randint(60, 180)
                        print(f"[DM JOB] Campaign {campaign_id}: attempt {attempt}/3 failed for contact {contact.id} (empty message), retry in {delay}s", flush=True)
                        await asyncio.sleep(delay)
                    continue

                try:
                    success = await send_message(client, contact.urn_id, message_body)
                except Exception as exc:
                    last_error = str(exc)[:500]
                    success = False
                    # Non-connection = permanent error, don't retry
                    if "RECIPIENT_NOT_FIRST_DEGREE_CONNECTION" in str(exc):
                        last_error = "Contact is not a 1st degree connection"
                        break

                if success:
                    send_ok = True
                    break
                else:
                    # Check for permanent LinkedIn errors (no point retrying)
                    if last_error and "RECIPIENT_NOT_FIRST_DEGREE_CONNECTION" in last_error:
                        break
                    last_error = last_error or "LinkedIn returned error"
                    if attempt < 3:
                        delay = random.randint(60, 180)
                        print(f"[DM JOB] Campaign {campaign_id}: attempt {attempt}/3 failed for contact {contact.id} ({last_error[:80]}), retry in {delay}s", flush=True)
                        await asyncio.sleep(delay)

            if _skip_no_perdu:
                # AI temporarily unavailable — don't mark perdu, just stop this tick
                # Contact will be retried on next tick when AI may be back
                db.commit()
                break

            if send_ok:
                cc = CampaignContact(
                    campaign_id=campaign_id,
                    contact_id=contact.id,
                    status="envoye",
                    last_sequence_sent=0,
                    main_sent_at=datetime.utcnow(),
                    last_sent_at=datetime.utcnow(),
                )
                db.add(cc)
                campaign.total_processed = (campaign.total_processed or 0) + 1
                contact.last_interaction_at = datetime.utcnow()
                _log_action(db, campaign_id, contact.id, "dm_send", "success")
                logger.info("Campaign %d: main DM sent to contact %d", campaign_id, contact.id)
            else:
                print(f"[DM JOB] Campaign {campaign_id}: failed for contact {contact.id}, marking perdu", flush=True)
                _log_action(db, campaign_id, contact.id, "dm_send", "failed", last_error)
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_failed = (campaign.total_failed or 0) + 1
                db.add(CampaignContact(
                    campaign_id=campaign_id, contact_id=contact.id,
                    status="perdu", last_sequence_sent=0,
                    main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                ))
                db.commit()
                # Wait 4 minutes before trying next contact
                print(f"[DM JOB] Campaign {campaign_id}: cooling down 4 min before next contact", flush=True)
                await asyncio.sleep(240)
                continue

            db.commit()
            break  # Sent one real message — wait for next tick

        # =====================================================================
        # PHASE 5: Check campaign completion
        # =====================================================================
        total_contacts = db.query(CampaignContact).filter(
            CampaignContact.campaign_id == campaign_id
        ).count()
        total_final = db.query(CampaignContact).filter(
            CampaignContact.campaign_id == campaign_id,
            CampaignContact.status.in_(FINAL_STATUSES),
        ).count()
        total_remaining_in_crm = (
            db.query(Contact)
            .filter(
                Contact.crm_id == campaign.crm_id,
                ~Contact.id.in_(
                    db.query(CampaignContact.contact_id)
                    .filter(CampaignContact.campaign_id == campaign_id)
                ),
            )
            .count()
        )

        # Update campaign counters
        total_reussi = db.query(CampaignContact).filter(
            CampaignContact.campaign_id == campaign_id,
            CampaignContact.status == "reussi",
        ).count()
        campaign.total_succeeded = total_reussi

        all_sent = total_remaining_in_crm == 0 or (campaign.total_target and total_contacts >= campaign.total_target)
        all_done = all_sent and total_final == total_contacts and total_contacts > 0

        if all_done:
            campaign.status = "completed"
            campaign.completed_at = datetime.utcnow()
            create_notification(db, campaign.user_id, "campaign_completed",
                f"Campagne \"{campaign.name}\" terminee",
                f"{total_reussi} reponse(s), {total_final - total_reussi} perdu(s)")
            db.commit()
            cancel_campaign_job(campaign_id)
            logger.info("Campaign %d completed: %d reussi, %d perdu",
                        campaign_id, total_reussi, total_final - total_reussi)

        db.commit()

    except Exception as exc:
        logger.exception("Unexpected error in DM campaign %d", campaign_id)
        try:
            db.rollback()
            campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            if campaign:
                campaign.error_message = f"[{datetime.utcnow().strftime('%H:%M:%S')}] {type(exc).__name__}: {str(exc)[:300]}"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


async def _render_message(campaign, template, contact, client):
    """Render a message for a contact, using AI if needed."""
    contact_data = {
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "headline": contact.headline,
        "location": contact.location,
    }

    if campaign.full_personalize and campaign.use_ai:
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
                0, [],
            )
            if msgs and msgs[0].get("rendered"):
                return msgs[0]["rendered"]
        except Exception as exc:
            logger.warning("AI generation failed for contact %s, falling back to template: %s", contact.urn_id, exc)
        return render_template(template, contact_data)

    elif campaign.use_ai and "{compliment}" in template:
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
            )
        except Exception as exc:
            logger.warning("AI compliment failed for contact %s, using empty: %s", contact.urn_id, exc)
            compliment = ""
        contact_data["compliment"] = compliment
        return render_template(template, contact_data)

    else:
        return render_template(template, contact_data)


def _log_action(db, campaign_id, contact_id, action_type, status, error_message=None):
    db.add(CampaignAction(
        campaign_id=campaign_id,
        contact_id=contact_id,
        action_type=action_type,
        status=status,
        error_message=error_message,
    ))
