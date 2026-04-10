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
from zoneinfo import ZoneInfo

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
from sqlalchemy.exc import IntegrityError
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

        # --- get message config ---
        main_msg = db.query(CampaignMessage).filter(
            CampaignMessage.campaign_id == campaign_id, CampaignMessage.sequence == 0
        ).first()
        main_fallback = (main_msg.fallback_template if main_msg and main_msg.fallback_template else None) or campaign.fallback_message
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
        _consecutive_ai_failures = 0
        _ai_skipped_ids = set()  # contacts skipped due to AI failure (retry next tick)
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
            q = db.query(Contact).filter(
                Contact.crm_id == campaign.crm_id,
                ~Contact.id.in_(already_ids),
            )
            if _ai_skipped_ids:
                q = q.filter(~Contact.id.in_(list(_ai_skipped_ids)))
            contact = q.order_by(Contact.added_at.asc()).first()

            if not contact:
                break

            # Skip if already in this campaign (race condition guard)
            already = db.query(CampaignContact).filter(
                CampaignContact.campaign_id == campaign_id,
                CampaignContact.contact_id == contact.id,
            ).first()
            if already:
                continue

            # Connection check — can only DM 1st degree connections
            if contact.connection_status not in ("connected", "DISTANCE_1"):
                _log_action(db, campaign_id, contact.id, "dm_send", "skipped", "Non connecte")
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_skipped = (campaign.total_skipped or 0) + 1
                try:
                    db.add(CampaignContact(
                        campaign_id=campaign_id, contact_id=contact.id,
                        status="perdu", last_sequence_sent=0,
                        main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                    ))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                continue

            # Blacklist check — skip and continue immediately
            if db.query(Blacklist).filter(Blacklist.urn_id == contact.urn_id, Blacklist.user_id == campaign.user_id).first():
                _log_action(db, campaign_id, contact.id, "dm_send", "skipped", "Blacklisted")
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_skipped = (campaign.total_skipped or 0) + 1
                # Mark in CampaignContact so it won't be picked again
                try:
                    db.add(CampaignContact(
                        campaign_id=campaign_id, contact_id=contact.id,
                        status="perdu", last_sequence_sent=0,
                        main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                    ))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                continue

            # Resolve URN if missing or potentially invalid
            resolved_urn = await resolve_contact_urn(client, contact)
            if not resolved_urn:
                _log_action(db, campaign_id, contact.id, "dm_send", "failed", "Could not resolve LinkedIn URN")
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_failed = (campaign.total_failed or 0) + 1
                try:
                    db.add(CampaignContact(
                        campaign_id=campaign_id, contact_id=contact.id,
                        status="perdu", last_sequence_sent=0,
                        main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                    ))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                continue

            # Flush URN update to catch duplicate URN in CRM
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                # Find the existing contact with the same URN
                existing = db.query(Contact).filter(
                    Contact.crm_id == campaign.crm_id,
                    Contact.urn_id == contact.urn_id,
                    Contact.id != contact.id,
                ).first()
                dup_name = f"{existing.first_name or ''} {existing.last_name or ''}".strip() if existing else "inconnu"
                _log_action(db, campaign_id, contact.id, "dm_send", "failed", f"Contact duplique dans le CRM (meme URN que {dup_name})")
                campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_failed = (campaign.total_failed or 0) + 1
                try:
                    db.add(CampaignContact(
                        campaign_id=campaign_id, contact_id=contact.id,
                        status="perdu", last_sequence_sent=0,
                        main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                    ))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                continue

            # Re-check connection after URN resolution (profile fetch updates connection_status)
            if contact.connection_status not in ("connected", "DISTANCE_1"):
                _log_action(db, campaign_id, contact.id, "dm_send", "failed", "Non connecte (verifie apres resolution URN)")
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_failed = (campaign.total_failed or 0) + 1
                try:
                    db.add(CampaignContact(
                        campaign_id=campaign_id, contact_id=contact.id,
                        status="perdu", last_sequence_sent=0,
                        main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                    ))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                continue

            template = campaign.message_template or ""

            # Retry up to 3 times with 1-3 min intervals
            send_ok = False
            last_error = None
            _skip_no_perdu = False  # True = AI temporarily down, skip without marking perdu
            for attempt in range(1, 4):
                try:
                    message_body = await _render_message(campaign, template, contact, client, api_key=user.gemini_api_key or "")
                except Exception as exc:
                    last_error = f"Render failed: {exc}"
                    message_body = None

                if not message_body or not message_body.strip():
                    last_error = last_error or "Empty message (AI generation failed)"
                    # For full_personalize with no template fallback, AI is likely down
                    if campaign.full_personalize and campaign.use_ai:
                        # If fallback message exists, use it instead of skipping
                        if main_fallback and main_fallback.strip():
                            contact_data = {
                                "first_name": contact.first_name,
                                "last_name": contact.last_name,
                                "headline": contact.headline,
                                "location": contact.location,
                            }
                            message_body = render_template(main_fallback, contact_data)
                            print(f"[DM JOB] Campaign {campaign_id}: AI failed, using fallback message for contact {contact.id}", flush=True)
                            # Don't break — fall through to send the message below
                        else:
                            print(f"[DM JOB] Campaign {campaign_id}: AI unavailable (Gemini down), no fallback — skipping", flush=True)
                            _skip_no_perdu = True
                            break
                    else:
                        if attempt < 3:
                            delay = random.randint(60, 180)
                            print(f"[DM JOB] Campaign {campaign_id}: attempt {attempt}/3 failed for contact {contact.id} (empty message), retry in {delay}s", flush=True)
                            await asyncio.sleep(delay)
                        continue

                _not_connected = False
                try:
                    success = await send_message(client, contact.urn_id, message_body)
                except Exception as exc:
                    last_error = str(exc)[:500]
                    success = False
                    if "RECIPIENT_NOT_FIRST_DEGREE_CONNECTION" in str(exc):
                        _not_connected = True

                if _not_connected:
                    # Permanent error — mark perdu immediately, skip to next contact
                    # Update connection_status so pre-screening catches similar contacts
                    contact.connection_status = "not_connected"
                    print(f"[DM JOB] Campaign {campaign_id}: contact {contact.id} not connected, skipping", flush=True)
                    _log_action(db, campaign_id, contact.id, "dm_send", "failed", "Non connecte — impossible d'envoyer un DM")
                    campaign.total_processed = (campaign.total_processed or 0) + 1
                    campaign.total_failed = (campaign.total_failed or 0) + 1
                    try:
                        db.add(CampaignContact(
                            campaign_id=campaign_id, contact_id=contact.id,
                            status="perdu", last_sequence_sent=0,
                            main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                        ))
                        db.commit()
                    except IntegrityError:
                        db.rollback()
                    send_ok = None  # signal: already handled
                    break

                if success:
                    send_ok = True
                    break
                else:
                    last_error = last_error or "LinkedIn returned error"
                    if attempt < 3:
                        delay = random.randint(60, 180)
                        print(f"[DM JOB] Campaign {campaign_id}: attempt {attempt}/3 failed for contact {contact.id} ({last_error[:80]}), retry in {delay}s", flush=True)
                        await asyncio.sleep(delay)

            if send_ok is None:
                # Already handled (e.g. not connected) — next contact immediately
                _consecutive_ai_failures = 0
                continue

            if _skip_no_perdu:
                # AI failed for this contact — skip it (retry next tick), try next contact
                _ai_skipped_ids.add(contact.id)
                _consecutive_ai_failures += 1
                print(f"[DM JOB] Campaign {campaign_id}: AI failed for contact {contact.id}, skipping to next ({_consecutive_ai_failures} consecutive AI failures)", flush=True)
                if _consecutive_ai_failures >= 3:
                    print(f"[DM JOB] Campaign {campaign_id}: 3 consecutive AI failures, stopping tick", flush=True)
                    break
                continue

            _consecutive_ai_failures = 0  # reset on non-AI outcome

            if send_ok:
                try:
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
                    db.commit()
                except IntegrityError:
                    db.rollback()
                break  # Sent one real message — wait for next tick
            else:
                # Failed after all retries — mark perdu and move to next contact immediately
                print(f"[DM JOB] Campaign {campaign_id}: failed for contact {contact.id}, marking perdu", flush=True)
                _log_action(db, campaign_id, contact.id, "dm_send", "failed", last_error)
                campaign.total_processed = (campaign.total_processed or 0) + 1
                campaign.total_failed = (campaign.total_failed or 0) + 1
                try:
                    db.add(CampaignContact(
                        campaign_id=campaign_id, contact_id=contact.id,
                        status="perdu", last_sequence_sent=0,
                        main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                    ))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                continue  # Next contact immediately, no cooldown

        # =====================================================================
        # PHASE 4b: Pre-screen upcoming contacts (resolve URN + check connection)
        # Eliminates invalid contacts now so next tick doesn't waste time on them
        # =====================================================================
        PRESCREEN_BATCH = 5
        _prescreened = 0
        _prescreen_max = 20  # safety cap
        while _prescreened < _prescreen_max:
            already_ids = (
                db.query(CampaignContact.contact_id)
                .filter(CampaignContact.campaign_id == campaign_id)
                .subquery()
            )
            upcoming = (
                db.query(Contact)
                .filter(
                    Contact.crm_id == campaign.crm_id,
                    ~Contact.id.in_(already_ids),
                )
                .order_by(Contact.added_at.asc())
                .limit(PRESCREEN_BATCH)
                .all()
            )
            if not upcoming:
                break

            had_invalid = False
            for contact in upcoming:
                _prescreened += 1
                # Quick DB check first
                if contact.connection_status not in ("connected", "DISTANCE_1"):
                    _log_action(db, campaign_id, contact.id, "dm_send", "skipped", "Non connecte (pre-screening)")
                    campaign.total_processed = (campaign.total_processed or 0) + 1
                    campaign.total_skipped = (campaign.total_skipped or 0) + 1
                    try:
                        db.add(CampaignContact(
                            campaign_id=campaign_id, contact_id=contact.id,
                            status="perdu", last_sequence_sent=0,
                            main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                        ))
                        db.commit()
                    except IntegrityError:
                        db.rollback()
                    had_invalid = True
                    continue

                # Blacklist check
                if db.query(Blacklist).filter(Blacklist.urn_id == contact.urn_id, Blacklist.user_id == campaign.user_id).first():
                    _log_action(db, campaign_id, contact.id, "dm_send", "skipped", "Blacklisted (pre-screening)")
                    campaign.total_processed = (campaign.total_processed or 0) + 1
                    campaign.total_skipped = (campaign.total_skipped or 0) + 1
                    try:
                        db.add(CampaignContact(
                            campaign_id=campaign_id, contact_id=contact.id,
                            status="perdu", last_sequence_sent=0,
                            main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                        ))
                        db.commit()
                    except IntegrityError:
                        db.rollback()
                    had_invalid = True
                    continue

                # Resolve URN and re-check connection via LinkedIn API
                try:
                    resolved_urn = await resolve_contact_urn(client, contact)
                except Exception:
                    resolved_urn = None

                if not resolved_urn:
                    _log_action(db, campaign_id, contact.id, "dm_send", "failed", "Could not resolve LinkedIn URN (pre-screening)")
                    campaign.total_processed = (campaign.total_processed or 0) + 1
                    campaign.total_failed = (campaign.total_failed or 0) + 1
                    try:
                        db.add(CampaignContact(
                            campaign_id=campaign_id, contact_id=contact.id,
                            status="perdu", last_sequence_sent=0,
                            main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                        ))
                        db.commit()
                    except IntegrityError:
                        db.rollback()
                    had_invalid = True
                    continue

                # Flush URN update
                try:
                    db.flush()
                except IntegrityError:
                    db.rollback()
                    existing = db.query(Contact).filter(
                        Contact.crm_id == campaign.crm_id,
                        Contact.urn_id == contact.urn_id,
                        Contact.id != contact.id,
                    ).first()
                    dup_name = f"{existing.first_name or ''} {existing.last_name or ''}".strip() if existing else "inconnu"
                    _log_action(db, campaign_id, contact.id, "dm_send", "failed", f"Contact duplique dans le CRM (meme URN que {dup_name}) (pre-screening)")
                    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
                    campaign.total_processed = (campaign.total_processed or 0) + 1
                    campaign.total_failed = (campaign.total_failed or 0) + 1
                    try:
                        db.add(CampaignContact(
                            campaign_id=campaign_id, contact_id=contact.id,
                            status="perdu", last_sequence_sent=0,
                            main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                        ))
                        db.commit()
                    except IntegrityError:
                        db.rollback()
                    had_invalid = True
                    continue

                # Re-check connection after URN resolution
                if contact.connection_status not in ("connected", "DISTANCE_1"):
                    _log_action(db, campaign_id, contact.id, "dm_send", "failed", "Non connecte (verifie apres resolution URN, pre-screening)")
                    campaign.total_processed = (campaign.total_processed or 0) + 1
                    campaign.total_failed = (campaign.total_failed or 0) + 1
                    try:
                        db.add(CampaignContact(
                            campaign_id=campaign_id, contact_id=contact.id,
                            status="perdu", last_sequence_sent=0,
                            main_sent_at=datetime.utcnow(), last_sent_at=datetime.utcnow(),
                        ))
                        db.commit()
                    except IntegrityError:
                        db.rollback()
                    had_invalid = True
                    continue

                # This contact looks valid — commit URN update and stop pre-screening
                db.commit()
                break
            else:
                # All contacts in this batch were invalid — check next batch
                if had_invalid:
                    print(f"[DM JOB] Campaign {campaign_id}: pre-screened batch of {PRESCREEN_BATCH}, all invalid — checking next batch", flush=True)
                    continue
                break
            # Found a valid contact — stop
            break

        if _prescreened > 0:
            print(f"[DM JOB] Campaign {campaign_id}: pre-screened {_prescreened} contacts", flush=True)

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

        # Check if there are still follow-ups pending (active contacts that haven't
        # exhausted all follow-up sequences).  If not, the campaign has nothing left
        # to do — reply_checker will continue monitoring active contacts even after
        # completion.
        pending_followups = 0
        if all_sent and max_followup_seq > 0:
            pending_followups = db.query(CampaignContact).filter(
                CampaignContact.campaign_id == campaign_id,
                CampaignContact.status.in_(ACTIVE_STATUSES),
                CampaignContact.last_sequence_sent < max_followup_seq,
            ).count()

        all_done = (
            all_sent
            and total_contacts > 0
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
            logger.info("Campaign %d completed: %d reussi, %d perdu",
                        campaign_id, total_reussi, total_final - total_reussi)

        db.commit()

    except Exception as exc:
        logger.exception("Unexpected error in DM campaign %d", campaign_id)
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
        # Don't send the __FULL_AI__ placeholder as an actual message
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


def _log_action(db, campaign_id, contact_id, action_type, status, error_message=None):
    db.add(CampaignAction(
        campaign_id=campaign_id,
        contact_id=contact_id,
        action_type=action_type,
        status=status,
        error_message=error_message,
    ))
