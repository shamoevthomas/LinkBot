"""
Connection + DM combo campaign job runner.

Flow per contact:
1. Send connection request → status "en_attente"
2. Check if pending connections were accepted:
   - If accepted → send main DM → status "envoye" → normal DM follow-up cycle
   - If 5 days without acceptance → status "perdu"
3. Follow-up cycle: relance_1..7 → reussi (reply) / perdu (exhausted)
"""

import asyncio
import logging
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models import (
    Campaign, CampaignAction, CampaignContact, CampaignMessage,
    Contact, AppSettings, User, Blacklist,
)
from app.linkedin_service import (
    get_linkedin_client, send_connection_request, send_message,
    get_profile, get_profile_posts, check_contact_replied, resolve_contact_urn,
)
from app.utils.template_engine import render_template
from app.utils.ai_message import (
    generate_compliment, generate_full_personalized_messages, extract_post_texts,
)
from app.scheduler import cancel_campaign_job, is_within_schedule, get_effective_daily_limit, get_global_actions_today

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {"envoye"} | {f"relance_{i}" for i in range(1, 8)}
FINAL_STATUSES = {"reussi", "perdu"}
CONNECTION_WAIT_DAYS = 5


async def run_connection_dm_campaign(campaign_id: int) -> None:
    print(f"[CONN_DM JOB] Campaign {campaign_id}: tick start", flush=True)
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

        # --- global daily limits ---
        conn_row = db.query(AppSettings).filter(AppSettings.key == "max_connections_per_day").first()
        conn_limit = get_effective_daily_limit(int(conn_row.value) if conn_row else 25, db)
        dm_row = db.query(AppSettings).filter(AppSettings.key == "max_dms_per_day").first()
        dm_limit = get_effective_daily_limit(int(dm_row.value) if dm_row else 50, db)

        dm_action_types = ["dm_send"] + [f"followup_{i}" for i in range(1, 8)]
        global_connections_today = get_global_actions_today(["connection_request"], db)
        global_dms_today = get_global_actions_today(dm_action_types, db)

        # --- get LinkedIn client ---
        user = db.query(User).first()
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

        # =====================================================================
        # PHASE 1: Check pending connections (en_attente) for acceptance
        # =====================================================================
        pending_contacts = (
            db.query(CampaignContact)
            .filter(
                CampaignContact.campaign_id == campaign_id,
                CampaignContact.status == "en_attente",
            )
            .order_by(CampaignContact.last_checked_at.asc().nullsfirst())
            .limit(5)
            .all()
        )

        for cc in pending_contacts:
            contact = db.query(Contact).filter(Contact.id == cc.contact_id).first()
            if not contact:
                continue

            cc.last_checked_at = datetime.utcnow()

            # Check if connection was accepted by fetching profile
            accepted = False
            try:
                profile = await get_profile(client, urn_id=contact.urn_id)
                distance = profile.get("distance", 0)
                if distance == 1 or str(profile.get("connectionDistance", "")).startswith("DISTANCE_1"):
                    accepted = True
            except Exception:
                pass

            if accepted:
                # Connection accepted → send main DM
                contact.connection_status = "connected"
                _log_action(db, campaign_id, contact.id, "connection_accepted", "success")
                logger.info("Campaign %d: connection accepted by contact %d", campaign_id, contact.id)

                if get_global_actions_today(dm_action_types, db) < dm_limit:
                    template = campaign.message_template or ""
                    message_body = await _render_message(campaign, template, contact, client)
                    try:
                        success = await send_message(client, contact.urn_id, message_body)
                    except Exception as exc:
                        _log_action(db, campaign_id, contact.id, "dm_send", "failed", str(exc)[:500])
                        cc.status = "envoye"  # still mark as envoye, retry next tick
                        db.commit()
                        continue

                    if success:
                        cc.status = "envoye"
                        cc.last_sequence_sent = 0
                        cc.main_sent_at = datetime.utcnow()
                        cc.last_sent_at = datetime.utcnow()
                        contact.last_interaction_at = datetime.utcnow()
                        _log_action(db, campaign_id, contact.id, "dm_send", "success")
                        logger.info("Campaign %d: main DM sent to contact %d", campaign_id, contact.id)
                    else:
                        cc.status = "envoye"
                        _log_action(db, campaign_id, contact.id, "dm_send", "failed", "LinkedIn returned error")
                else:
                    # Daily DM limit reached, just mark accepted — DM will be sent next tick
                    cc.status = "envoye"
                    cc.last_sequence_sent = -1  # DM not yet sent

            elif cc.main_sent_at and datetime.utcnow() - cc.main_sent_at > timedelta(days=CONNECTION_WAIT_DAYS):
                # Connection not accepted after 5 days → perdu
                cc.status = "perdu"
                _log_action(db, campaign_id, contact.id, "connection_expired", "success")
                logger.info("Campaign %d: contact %d connection expired (5 days)", campaign_id, contact.id)

        db.commit()

        # =====================================================================
        # PHASE 2: Send pending first DMs (accepted but DM not yet sent)
        # =====================================================================
        if get_global_actions_today(dm_action_types, db) < dm_limit:
            needs_dm = (
                db.query(CampaignContact)
                .filter(
                    CampaignContact.campaign_id == campaign_id,
                    CampaignContact.status == "envoye",
                    CampaignContact.last_sequence_sent == -1,
                )
                .all()
            )
            for cc in needs_dm:
                if get_global_actions_today(dm_action_types, db) >= dm_limit:
                    break
                contact = db.query(Contact).filter(Contact.id == cc.contact_id).first()
                if not contact:
                    continue

                template = campaign.message_template or ""
                message_body = await _render_message(campaign, template, contact, client)
                try:
                    success = await send_message(client, contact.urn_id, message_body)
                except Exception as exc:
                    _log_action(db, campaign_id, contact.id, "dm_send", "failed", str(exc)[:500])
                    continue

                if success:
                    cc.last_sequence_sent = 0
                    cc.main_sent_at = datetime.utcnow()
                    cc.last_sent_at = datetime.utcnow()
                    contact.last_interaction_at = datetime.utcnow()
                    _log_action(db, campaign_id, contact.id, "dm_send", "success")
                else:
                    _log_action(db, campaign_id, contact.id, "dm_send", "failed", "LinkedIn returned error")
                db.commit()

        # =====================================================================
        # PHASE 3: Check replies for contacts in DM cycle
        # =====================================================================
        active_contacts = (
            db.query(CampaignContact)
            .filter(
                CampaignContact.campaign_id == campaign_id,
                CampaignContact.status.in_(ACTIVE_STATUSES),
                CampaignContact.last_sequence_sent >= 0,
            )
            .order_by(CampaignContact.last_checked_at.asc().nullsfirst())
            .limit(5)
            .all()
        )

        for cc in active_contacts:
            contact = db.query(Contact).filter(Contact.id == cc.contact_id).first()
            if not contact:
                continue
            try:
                replied = await check_contact_replied(client, contact.urn_id)
            except Exception:
                replied = False

            cc.last_checked_at = datetime.utcnow()
            if replied:
                cc.status = "reussi"
                cc.replied_at = datetime.utcnow()
                campaign.total_succeeded = (campaign.total_succeeded or 0) + 1
                contact.last_interaction_at = datetime.utcnow()
                _log_action(db, campaign_id, contact.id, "reply_detected", "success")
                logger.info("Campaign %d: reply detected from contact %d", campaign_id, contact.id)

        db.commit()

        # =====================================================================
        # PHASE 4: Send follow-ups where delay has been reached
        # =====================================================================
        if get_global_actions_today(dm_action_types, db) < dm_limit and followups:
            for cc in (
                db.query(CampaignContact)
                .filter(
                    CampaignContact.campaign_id == campaign_id,
                    CampaignContact.status.in_(ACTIVE_STATUSES),
                    CampaignContact.last_sequence_sent >= 0,
                    CampaignContact.last_sequence_sent < max_followup_seq,
                )
                .order_by(CampaignContact.last_sent_at.asc())
                .all()
            ):
                if get_global_actions_today(dm_action_types, db) >= dm_limit:
                    break

                next_seq = cc.last_sequence_sent + 1
                followup_msg = next((f for f in followups if f.sequence == next_seq), None)
                if not followup_msg:
                    continue

                delay = timedelta(days=followup_msg.delay_days)
                if cc.last_sent_at and datetime.utcnow() - cc.last_sent_at < delay:
                    continue

                contact = db.query(Contact).filter(Contact.id == cc.contact_id).first()
                if not contact:
                    continue

                # Check reply before sending
                try:
                    replied = await check_contact_replied(client, contact.urn_id)
                except Exception:
                    replied = False
                if replied:
                    cc.status = "reussi"
                    cc.replied_at = datetime.utcnow()
                    campaign.total_succeeded = (campaign.total_succeeded or 0) + 1
                    _log_action(db, campaign_id, contact.id, "reply_detected", "success")
                    db.commit()
                    continue

                message_body = await _render_message(
                    campaign, followup_msg.message_template, contact, client
                )
                try:
                    success = await send_message(client, contact.urn_id, message_body)
                except Exception as exc:
                    _log_action(db, campaign_id, contact.id, f"followup_{next_seq}", "failed", str(exc)[:500])
                    db.commit()
                    continue

                if success:
                    cc.last_sequence_sent = next_seq
                    cc.last_sent_at = datetime.utcnow()
                    cc.status = f"relance_{next_seq}"
                    contact.last_interaction_at = datetime.utcnow()
                    _log_action(db, campaign_id, contact.id, f"followup_{next_seq}", "success")
                else:
                    _log_action(db, campaign_id, contact.id, f"followup_{next_seq}", "failed", "LinkedIn returned error")

                db.commit()
                break  # One send per tick

        # =====================================================================
        # PHASE 5: Mark "perdu" for contacts with all follow-ups exhausted
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
            db.commit()
        else:
            grace_delay = timedelta(days=3)
            for cc in (
                db.query(CampaignContact)
                .filter(
                    CampaignContact.campaign_id == campaign_id,
                    CampaignContact.status == "envoye",
                    CampaignContact.last_sequence_sent >= 0,
                )
                .all()
            ):
                if cc.last_sent_at and datetime.utcnow() - cc.last_sent_at >= grace_delay:
                    cc.status = "perdu"
            db.commit()

        # =====================================================================
        # PHASE 6: Send connection request to next unprocessed contact
        # =====================================================================
        if get_global_actions_today(["connection_request"], db) < conn_limit:
            total_contacted = db.query(CampaignContact).filter(
                CampaignContact.campaign_id == campaign_id
            ).count()

            if not campaign.total_target or total_contacted < campaign.total_target:
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

                if contact:
                    # Skip if already in this campaign (race condition guard)
                    already = db.query(CampaignContact).filter(
                        CampaignContact.campaign_id == campaign_id,
                        CampaignContact.contact_id == contact.id,
                    ).first()
                    if already:
                        return

                    # Resolve URN
                    resolved_urn = await resolve_contact_urn(client, contact)
                    if not resolved_urn:
                        _log_action(db, campaign_id, contact.id, "connection_request", "failed", "Could not resolve LinkedIn URN")
                        campaign.total_processed = (campaign.total_processed or 0) + 1
                        campaign.total_failed = (campaign.total_failed or 0) + 1
                        db.commit()
                        return

                    # Blacklist check
                    if db.query(Blacklist).filter(Blacklist.urn_id == contact.urn_id).first():
                        _log_action(db, campaign_id, contact.id, "connection_request", "skipped", "Blacklisted")
                        campaign.total_processed = (campaign.total_processed or 0) + 1
                        campaign.total_skipped = (campaign.total_skipped or 0) + 1
                        db.commit()
                        return

                    # Skip if already connected
                    if contact.connection_status in ("connected", "DISTANCE_1"):
                        # Already connected → go straight to DM
                        cc = CampaignContact(
                            campaign_id=campaign_id,
                            contact_id=contact.id,
                            status="envoye",
                            last_sequence_sent=-1,  # DM not yet sent
                            main_sent_at=datetime.utcnow(),
                        )
                        db.add(cc)
                        campaign.total_processed = (campaign.total_processed or 0) + 1
                        _log_action(db, campaign_id, contact.id, "already_connected", "success")
                        db.commit()
                    else:
                        # Send connection request
                        try:
                            result = await send_connection_request(client, contact.urn_id)
                        except Exception as exc:
                            _log_action(db, campaign_id, contact.id, "connection_request", "failed", str(exc)[:500])
                            campaign.total_processed = (campaign.total_processed or 0) + 1
                            campaign.total_failed = (campaign.total_failed or 0) + 1
                            db.commit()
                            return

                        contact.connection_status = "pending"
                        if isinstance(result, dict):
                            inv_id = result.get("invitation_id") or result.get("invitationId")
                            if inv_id:
                                contact.invitation_id = str(inv_id)
                        contact.last_interaction_at = datetime.utcnow()

                        cc = CampaignContact(
                            campaign_id=campaign_id,
                            contact_id=contact.id,
                            status="en_attente",
                            last_sequence_sent=-1,
                            main_sent_at=datetime.utcnow(),  # tracks when connection was sent
                        )
                        db.add(cc)
                        campaign.total_processed = (campaign.total_processed or 0) + 1
                        _log_action(db, campaign_id, contact.id, "connection_request", "success")
                        logger.info("Campaign %d: connection request sent to contact %d", campaign_id, contact.id)
                        db.commit()

        # =====================================================================
        # PHASE 7: Check campaign completion
        # =====================================================================
        total_contacts = db.query(CampaignContact).filter(
            CampaignContact.campaign_id == campaign_id
        ).count()
        total_final = db.query(CampaignContact).filter(
            CampaignContact.campaign_id == campaign_id,
            CampaignContact.status.in_(FINAL_STATUSES),
        ).count()
        total_remaining = (
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

        total_reussi = db.query(CampaignContact).filter(
            CampaignContact.campaign_id == campaign_id,
            CampaignContact.status == "reussi",
        ).count()
        campaign.total_succeeded = total_reussi

        all_sent = total_remaining == 0 or (campaign.total_target and total_contacts >= campaign.total_target)
        all_done = all_sent and total_final == total_contacts and total_contacts > 0

        if all_done:
            campaign.status = "completed"
            campaign.completed_at = datetime.utcnow()
            db.commit()
            cancel_campaign_job(campaign_id)
            logger.info("Campaign %d completed", campaign_id)

        db.commit()

    except Exception as exc:
        logger.exception("Unexpected error in connection_dm campaign %d", campaign_id)
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

        msgs = await asyncio.to_thread(
            generate_full_personalized_messages,
            contact_data, profile_data, recent_posts,
            campaign.context_text or "", campaign.ai_prompt or "",
            0, [],
        )
        return msgs[0]["rendered"] if msgs and msgs[0]["rendered"] else render_template(template, contact_data)

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

        compliment = await asyncio.to_thread(
            generate_compliment, contact_data, profile_data, recent_posts,
            campaign.context_text or "", campaign.ai_prompt or "",
        )
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
