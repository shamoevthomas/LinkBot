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
from zoneinfo import ZoneInfo
from sqlalchemy.exc import IntegrityError

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
from app.scheduler import cancel_campaign_job, is_within_schedule, get_effective_daily_limit, get_user_actions_today
from app.routers.notifications import create_notification

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {"envoye"} | {f"relance_{i}" for i in range(1, 8)}
FINAL_STATUSES = {"reussi", "perdu"}
# LinkedIn invitations stay pending for months; 5 days was far too aggressive
# and buried real prospects under "perdu" before they ever got a chance to
# accept. Per-user override via the connection_wait_days setting.
DEFAULT_CONNECTION_WAIT_DAYS = 14


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

        # --- schedule window (per-user) ---
        if not is_within_schedule(campaign.user_id, db):
            return

        # --- per-user daily limits ---
        from app.utils.settings import get_setting
        conn_limit = get_effective_daily_limit(
            int(get_setting(db, campaign.user_id, "max_connections_per_day", "25") or "25"),
            campaign.user_id, db,
        )
        dm_limit = get_effective_daily_limit(
            int(get_setting(db, campaign.user_id, "max_dms_per_day", "50") or "50"),
            campaign.user_id, db,
        )

        try:
            connection_wait_days = int(
                get_setting(db, campaign.user_id, "connection_wait_days",
                            str(DEFAULT_CONNECTION_WAIT_DAYS))
                or DEFAULT_CONNECTION_WAIT_DAYS
            )
        except (TypeError, ValueError):
            connection_wait_days = DEFAULT_CONNECTION_WAIT_DAYS

        dm_action_types = ["dm_send"]
        global_connections_today = get_user_actions_today(["connection_request"], campaign.user_id, db)
        global_dms_today = get_user_actions_today(dm_action_types, campaign.user_id, db)

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

            # `sync_connections` is the source of truth for acceptance: it
            # pulls the user's real LinkedIn connections list, flips
            # contact.connection_status to "connected" AND stamps
            # cc.connection_accepted_at. get_profile() does not surface
            # connection distance, so polling it here was a no-op that left
            # every invitation stuck in en_attente.
            # Either signal counts — relying on connection_status alone meant a
            # sync that stamped the timestamp but missed the status left the
            # invitation to rot until it expired.
            accepted = (
                contact.connection_status == "connected"
                or cc.connection_accepted_at is not None
            )

            if accepted:
                contact.connection_status = "connected"

                if not cc.connection_accepted_at:
                    cc.connection_accepted_at = datetime.utcnow()
                    _log_action(db, campaign_id, contact.id, "connection_accepted", "success")
                    logger.info("Campaign %d: connection accepted by contact %d", campaign_id, contact.id)

                # Check if delay after acceptance has passed
                dm_delay = timedelta(hours=campaign.dm_delay_hours or 0)
                if datetime.utcnow() - cc.connection_accepted_at < dm_delay:
                    db.commit()
                    continue  # Not yet time to send DM

                if get_user_actions_today(dm_action_types, campaign.user_id, db) < dm_limit:
                    template = campaign.message_template or ""
                    try:
                        message_body = await _render_message(campaign, template, contact, client, api_key=user.gemini_api_key or "")
                        if message_body and message_body.strip():
                            from app.utils.ai_message import record_gemini_success
                            record_gemini_success(campaign.user_id)
                    except Exception as exc:
                        from app.utils.ai_message import (
                            GeminiAuthError, GeminiOverloadedError, mark_gemini_key_invalid,
                            record_gemini_auth_failure, should_invalidate_gemini_key,
                        )
                        if isinstance(exc, GeminiOverloadedError):
                            fallback = (campaign.fallback_message or "").strip()
                            if fallback:
                                _contact_vars = {
                                    "first_name": contact.first_name,
                                    "last_name": contact.last_name,
                                    "headline": contact.headline,
                                    "location": contact.location,
                                }
                                message_body = render_template(fallback, _contact_vars)
                                logger.info(
                                    "Campaign %d (user %s): Gemini overloaded on contact %d → fallback message",
                                    campaign_id, campaign.user_id, contact.id,
                                )
                                # Fall through to send
                            else:
                                cc.last_checked_at = datetime.utcnow()
                                db.commit()
                                continue
                        elif isinstance(exc, GeminiAuthError):
                            record_gemini_auth_failure(campaign.user_id)
                            if should_invalidate_gemini_key(campaign.user_id):
                                mark_gemini_key_invalid(campaign.user_id)
                                cancel_campaign_job(campaign_id)
                                return
                            # Below threshold: send the fallback message if the user
                            # provided one, otherwise skip this prospect.
                            fallback = (campaign.fallback_message or "").strip()
                            if fallback:
                                _contact_vars = {
                                    "first_name": contact.first_name,
                                    "last_name": contact.last_name,
                                    "headline": contact.headline,
                                    "location": contact.location,
                                }
                                message_body = render_template(fallback, _contact_vars)
                                logger.info(
                                    "Campaign %d (user %s): Gemini glitch on contact %d → fallback message",
                                    campaign_id, campaign.user_id, contact.id,
                                )
                                # Fall through to the send_message call below
                            else:
                                cc.last_checked_at = datetime.utcnow()
                                db.commit()
                                continue
                        else:
                            raise
                    try:
                        success = await send_message(client, contact.urn_id, message_body)
                    except Exception as exc:
                        from app.utils.rate_limit_cooldown import is_rate_limit_error, trigger_dms_cooldown
                        _log_action(db, campaign_id, contact.id, "dm_send", "failed", str(exc)[:500])
                        if is_rate_limit_error(exc):
                            until = trigger_dms_cooldown(db, campaign.user_id)
                            cc.status = "envoye"
                            db.commit()
                            logger.warning(
                                "Campaign %d (user %s): DM 429 on contact %d, DMs cooldown until %s",
                                campaign_id, campaign.user_id, contact.id, until.isoformat(),
                            )
                            return
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
                    # Daily DM limit reached — keep en_attente, DM will be sent next tick via Phase 2
                    cc.status = "envoye"
                    cc.last_sequence_sent = -1  # DM not yet sent
                    db.commit()

            elif cc.main_sent_at and datetime.utcnow() - cc.main_sent_at > timedelta(days=connection_wait_days):
                # Invitation still pending after the wait window → perdu
                cc.status = "perdu"
                _log_action(db, campaign_id, contact.id, "connection_expired", "success")
                logger.info(
                    "Campaign %d: contact %d connection expired (%d days)",
                    campaign_id, contact.id, connection_wait_days,
                )

        db.commit()

        # =====================================================================
        # PHASE 2: Send pending first DMs (accepted but DM not yet sent)
        # =====================================================================
        if get_user_actions_today(dm_action_types, campaign.user_id, db) < dm_limit:
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
                if get_user_actions_today(dm_action_types, campaign.user_id, db) >= dm_limit:
                    break
                # Respect dm_delay_hours after connection acceptance
                if cc.connection_accepted_at:
                    dm_delay = timedelta(hours=campaign.dm_delay_hours or 0)
                    if datetime.utcnow() - cc.connection_accepted_at < dm_delay:
                        continue
                contact = db.query(Contact).filter(Contact.id == cc.contact_id).first()
                if not contact:
                    continue

                template = campaign.message_template or ""
                try:
                    message_body = await _render_message(campaign, template, contact, client, api_key=user.gemini_api_key or "")
                except Exception as exc:
                    from app.utils.ai_message import GeminiAuthError, GeminiOverloadedError
                    if isinstance(exc, (GeminiAuthError, GeminiOverloadedError)):
                        fallback = (campaign.fallback_message or "").strip()
                        if not fallback:
                            logger.warning(
                                "Campaign %d (user %s): Gemini unavailable on contact %d (phase 2), no fallback — skipping",
                                campaign_id, campaign.user_id, contact.id,
                            )
                            continue
                        _contact_vars = {
                            "first_name": contact.first_name,
                            "last_name": contact.last_name,
                            "headline": contact.headline,
                            "location": contact.location,
                        }
                        message_body = render_template(fallback, _contact_vars)
                        logger.info(
                            "Campaign %d (user %s): Gemini glitch on contact %d (phase 2) → fallback",
                            campaign_id, campaign.user_id, contact.id,
                        )
                    else:
                        logger.warning(
                            "Campaign %d (user %s): render failed on contact %d (phase 2): %s",
                            campaign_id, campaign.user_id, contact.id, exc,
                        )
                        continue
                try:
                    success = await send_message(client, contact.urn_id, message_body)
                except Exception as exc:
                    from app.utils.rate_limit_cooldown import is_rate_limit_error, trigger_dms_cooldown
                    _log_action(db, campaign_id, contact.id, "dm_send", "failed", str(exc)[:500])
                    if is_rate_limit_error(exc):
                        until = trigger_dms_cooldown(db, campaign.user_id)
                        db.commit()
                        logger.warning(
                            "Campaign %d (user %s): DM 429 (phase 2) on contact %d, DMs cooldown until %s",
                            campaign_id, campaign.user_id, contact.id, until.isoformat(),
                        )
                        return
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

        # NOTE: Reply checking moved to reply_checker.py (runs every 5 min)

        # NOTE: Follow-up sends moved to reply_checker.py (runs every 5 min)

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
        while get_user_actions_today(["connection_request"], campaign.user_id, db) < conn_limit:
            total_contacted = db.query(CampaignContact).filter(
                CampaignContact.campaign_id == campaign_id
            ).count()

            if campaign.total_target and total_contacted >= campaign.total_target:
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

            # Resolve URN
            resolved_urn = await resolve_contact_urn(client, contact)
            if not resolved_urn:
                _log_action(db, campaign_id, contact.id, "connection_request", "failed", "Could not resolve LinkedIn URN")
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_failed = (campaign.total_failed or 0) + 1
                # Mark the contact as handled. Without a CampaignContact row it
                # stays outside `already_ids`, so the next iteration selects the
                # very same contact — and since get_user_actions_today only
                # counts *successful* actions, the while condition never moves
                # either. The campaign spun on unresolvable profiles forever,
                # burning LinkedIn calls without ever sending an invitation.
                try:
                    db.add(CampaignContact(
                        campaign_id=campaign_id, contact_id=contact.id,
                        status="perdu", last_sequence_sent=-1,
                        main_sent_at=datetime.utcnow(),
                    ))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                continue

            # Blacklist check
            if db.query(Blacklist).filter(Blacklist.urn_id == contact.urn_id, Blacklist.user_id == campaign.user_id).first():
                _log_action(db, campaign_id, contact.id, "connection_request", "skipped", "Blacklisted")
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_skipped = (campaign.total_skipped or 0) + 1
                # Same trap as the URN failure above: no CampaignContact row means
                # this contact gets re-selected on the next iteration forever.
                try:
                    db.add(CampaignContact(
                        campaign_id=campaign_id, contact_id=contact.id,
                        status="perdu", last_sequence_sent=-1,
                        main_sent_at=datetime.utcnow(),
                    ))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                continue

            # Skip if already connected
            if contact.connection_status in ("connected", "DISTANCE_1"):
                # Already connected → go straight to DM
                try:
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
                except IntegrityError:
                    db.rollback()
                continue

            # Send connection request
            try:
                result = await send_connection_request(client, contact.urn_id)
            except Exception as exc:
                err_text = str(exc)
                is_rate_limited = "FUSE_LIMIT_EXCEEDED" in err_text or "status code 429" in err_text
                _log_action(db, campaign_id, contact.id, "connection_request", "failed", err_text[:500])
                if is_rate_limited:
                    from app.utils.rate_limit_cooldown import trigger_connections_cooldown
                    until = trigger_connections_cooldown(db, campaign.user_id)
                    db.commit()
                    logger.warning(
                        "Campaign %d (user %s): LinkedIn FUSE_LIMIT_EXCEEDED on contact %d (connection phase), connections cooldown until %s",
                        campaign_id, campaign.user_id, contact.id, until.isoformat(),
                    )
                    break

                from app.linkedin_service import is_dead_cookie_error, mark_cookies_invalid
                if is_dead_cookie_error(exc):
                    mark_cookies_invalid(campaign.user_id)
                    campaign.status = "paused"
                    campaign.error_message = "Cookies LinkedIn invalides — recolle-les dans Configuration."
                    db.commit()
                    cancel_campaign_job(campaign_id)
                    return
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_failed = (campaign.total_failed or 0) + 1
                # Mark contact as handled so the loop doesn't retry the same one forever.
                try:
                    db.add(CampaignContact(
                        campaign_id=campaign_id, contact_id=contact.id,
                        status="perdu", last_sequence_sent=-1,
                        main_sent_at=datetime.utcnow(),
                    ))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                continue

            contact.connection_status = "pending"
            if isinstance(result, dict):
                inv_id = result.get("invitation_id") or result.get("invitationId")
                if inv_id:
                    contact.invitation_id = str(inv_id)
            contact.last_interaction_at = datetime.utcnow()

            try:
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
            except IntegrityError:
                db.rollback()
            # Sent one request — wait for next tick
            break

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

        # Check if there are still follow-ups pending (active contacts that haven't
        # exhausted all follow-up sequences).  reply_checker will continue monitoring
        # active contacts even after completion.
        pending_followups = 0
        if all_sent and max_followup_seq > 0:
            pending_followups = db.query(CampaignContact).filter(
                CampaignContact.campaign_id == campaign_id,
                CampaignContact.status.in_(ACTIVE_STATUSES),
                CampaignContact.last_sequence_sent < max_followup_seq,
            ).count()

        # Also check for contacts waiting for connection acceptance
        pending_connections = 0
        if all_sent:
            pending_connections = db.query(CampaignContact).filter(
                CampaignContact.campaign_id == campaign_id,
                CampaignContact.status == "en_attente",
            ).count()

        all_done = (
            all_sent
            and total_contacts > 0
            and pending_connections == 0
            and (total_final == total_contacts or pending_followups == 0)
        )

        if all_done:
            campaign.status = "completed"
            campaign.completed_at = datetime.utcnow()
            create_notification(db, campaign.user_id, "campaign_completed",
                f"Campagne \"{campaign.name}\" terminee",
                f"{total_reussi} reponse(s), {total_final - total_reussi} perdu(s)")
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
                campaign.error_message = f"[{datetime.now(ZoneInfo('Europe/Paris')).strftime('%H:%M:%S')}] {type(exc).__name__}: {str(exc)[:300]}"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


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
        return render_template(template, contact_data)

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
