"""
Lead Magnet job runner.

Each tick:
1. Fetch post comments, detect new keyword matches
2. Check pending connection requests
3. Process actions: like, reply, DM, or connection request
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.database import SessionLocal
from app.models import LeadMagnet, LeadMagnetContact, CampaignAction, User
from app.linkedin_service import (
    get_linkedin_client, get_post_comments, like_comment, reply_to_comment,
    send_message, send_connection_request, get_profile, get_comment_replies,
    get_invitations, accept_invitation,
)
from app.utils.template_engine import render_template
from app.scheduler import cancel_campaign_job


def _lm_key(lm_id: int) -> str:
    return f"lm_{lm_id}"

logger = logging.getLogger(__name__)

CONNECTION_WAIT_DAYS = 7


def _log_action(db, lead_magnet_id, contact_id, action_type, status, error_message=None):
    db.add(CampaignAction(
        lead_magnet_id=lead_magnet_id,
        contact_id=contact_id,
        action_type=action_type,
        status=status,
        error_message=error_message,
    ))


def _render(template, commenter_name):
    """Render a template with commenter info."""
    if not template:
        return ""
    parts = (commenter_name or "").split(" ", 1)
    contact_data = {
        "first_name": parts[0] if parts else "",
        "last_name": parts[1] if len(parts) > 1 else "",
        "name": commenter_name or "",
    }
    return render_template(template, contact_data)


async def run_lead_magnet_tick(lead_magnet_id: int) -> None:
    """Run one tick of a lead magnet."""
    print(f"[LEAD MAGNET] #{lead_magnet_id}: tick start", flush=True)
    db = SessionLocal()
    try:
        lm = db.query(LeadMagnet).filter(LeadMagnet.id == lead_magnet_id).first()
        if not lm:
            cancel_campaign_job(_lm_key(lead_magnet_id))
            return
        if lm.status != "running":
            return

        user = db.query(User).filter(User.id == lm.user_id).first()
        if not user or not user.li_at_cookie or not user.cookies_valid:
            lm.status = "failed"
            lm.error_message = "No valid LinkedIn cookies"
            db.commit()
            cancel_campaign_job(_lm_key(lead_magnet_id))
            return

        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

        # =================================================================
        # PHASE 1: Fetch comments & detect new keyword matches
        # =================================================================
        await _phase_detect_comments(db, lm, client)

        # =================================================================
        # PHASE 2: Check pending connections
        # =================================================================
        await _phase_check_connections(db, lm, client)

        # =================================================================
        # PHASE 3: Process actions (like, reply, DM, connection)
        # =================================================================
        await _phase_process_actions(db, lm, client)

        db.commit()

    except Exception as exc:
        logger.exception("Error in lead magnet %d", lead_magnet_id)
        try:
            db.rollback()
            lm = db.query(LeadMagnet).filter(LeadMagnet.id == lead_magnet_id).first()
            if lm:
                lm.error_message = (
                    f"[{datetime.now(ZoneInfo('Europe/Paris')).strftime('%H:%M:%S')}] "
                    f"{type(exc).__name__}: {str(exc)[:300]}"
                )
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
        print(f"[LEAD MAGNET] #{lead_magnet_id}: tick done", flush=True)


async def _phase_detect_comments(db, lm, client):
    """Fetch post comments and detect new keyword matches."""
    try:
        comments = await get_post_comments(client, lm.post_activity_urn)
    except Exception as exc:
        logger.warning("Failed to fetch comments for lead magnet %d: %s", lm.id, exc)
        lm.error_message = f"Comment fetch error: {str(exc)[:200]}"
        db.commit()
        return

    print(f"[LEAD MAGNET] #{lm.id}: fetched {len(comments)} comments for urn={lm.post_activity_urn}", flush=True)

    # Sample log to diagnose LinkedIn API shape changes
    if comments:
        first = comments[0] or {}
        sample_keys = list(first.keys())[:8]
        print(f"[LEAD MAGNET] #{lm.id}: first comment keys={sample_keys}", flush=True)

    processed_ids = set(json.loads(lm.processed_comment_ids or "[]"))
    stats = {"total": 0, "no_urn": 0, "already_seen": 0, "no_keyword": 0, "own_comment": 0, "no_commenter": 0, "new": 0}

    # ── Get current user's URN to check for existing replies ──
    my_urn_id = None
    try:
        my_profile = await asyncio.to_thread(client.get_user_profile)
        my_entity_urn = (
            my_profile.get("miniProfile", {}).get("entityUrn")
            or my_profile.get("miniProfile", {}).get("dashEntityUrn")
            or my_profile.get("entityUrn")
            or ""
        )
        if my_entity_urn:
            my_urn_id = my_entity_urn.split(":")[-1]
    except Exception:
        logger.warning("Could not fetch own profile for reply check (lead magnet %d)", lm.id)

    keyword = (lm.keyword or "").lower()
    new_matches = 0

    for element in comments:
        stats["total"] += 1
        # Extract comment data from LinkedIn API response
        comment_urn = element.get("dashEntityUrn") or element.get("urn") or ""
        if not comment_urn:
            stats["no_urn"] += 1
            continue

        # Skip already processed
        if comment_urn in processed_ids:
            stats["already_seen"] += 1
            continue
        processed_ids.add(comment_urn)

        # Extract comment text
        commentary = element.get("commentary") or element.get("comment") or {}
        if isinstance(commentary, dict):
            comment_text = commentary.get("text", "")
        elif isinstance(commentary, str):
            comment_text = commentary
        else:
            comment_text = str(commentary)

        # Check keyword match (partial, case-insensitive)
        if keyword and keyword not in comment_text.lower():
            stats["no_keyword"] += 1
            continue

        # Extract commenter info
        commenter = element.get("commenter") or {}
        commenter_entity = commenter.get("com.linkedin.voyager.feed.MemberActor") or commenter
        commenter_urn_id = ""
        commenter_name = ""

        # Try different paths to get commenter URN
        member_urn = commenter_entity.get("urn") or commenter_entity.get("miniProfile", {}).get("dashEntityUrn") or ""
        if member_urn:
            # Extract ID from urn:li:fsd_profile:xxx or urn:li:member:xxx
            parts = member_urn.split(":")
            commenter_urn_id = parts[-1] if parts else ""

        # Try to get name
        mini = commenter_entity.get("miniProfile") or commenter_entity.get("actor") or {}
        if isinstance(mini, dict):
            first = mini.get("firstName", "")
            last = mini.get("lastName", "")
            commenter_name = f"{first} {last}".strip()
            if not commenter_urn_id:
                ep = mini.get("entityUrn") or mini.get("dashEntityUrn") or ""
                if ep:
                    commenter_urn_id = ep.split(":")[-1]

        if not commenter_urn_id:
            stats["no_commenter"] += 1
            continue

        # Skip if it's the user's own comment
        if my_urn_id and commenter_urn_id == my_urn_id:
            stats["own_comment"] += 1
            continue

        # Check if already tracked
        existing = db.query(LeadMagnetContact).filter(
            LeadMagnetContact.lead_magnet_id == lm.id,
            LeadMagnetContact.commenter_urn_id == commenter_urn_id,
        ).first()
        if existing:
            continue

        # Check connection status. Prefer the distance value already present
        # in the comment envelope (MemberActor.distance) — it is reliable and
        # avoids a separate /profile call that currently fails intermittently
        # under the new GraphQL envelope.
        inline_distance = (
            element.get("distance")
            or commenter_entity.get("distance")
        )
        if isinstance(inline_distance, dict):
            inline_distance = inline_distance.get("value")
        is_connected = inline_distance in (1, "DISTANCE_1", "1")

        # Only call get_profile if we still don't have a name or distance info.
        if not is_connected and not inline_distance:
            try:
                profile = await get_profile(client, urn_id=commenter_urn_id)
                distance = profile.get("distance")
                is_connected = distance in (1, "DISTANCE_1", "1")
                if not commenter_name:
                    commenter_name = f"{profile.get('firstName', '')} {profile.get('lastName', '')}".strip()
            except Exception:
                pass

        # ── Check if user already replied to this comment ──
        already_replied = False
        if my_urn_id and comment_urn:
            try:
                replies = await get_comment_replies(client, lm.post_activity_urn, comment_urn)
                for reply in replies:
                    rc = reply.get("commenter") or {}
                    rc_entity = rc.get("com.linkedin.voyager.feed.MemberActor") or rc
                    rc_urn = (
                        rc_entity.get("urn")
                        or rc_entity.get("miniProfile", {}).get("dashEntityUrn")
                        or ""
                    )
                    if rc_urn and my_urn_id in rc_urn:
                        already_replied = True
                        break
            except Exception:
                pass  # If check fails, assume not replied

        lmc = LeadMagnetContact(
            lead_magnet_id=lm.id,
            commenter_urn_id=commenter_urn_id,
            commenter_name=commenter_name,
            comment_urn=comment_urn,
            comment_text=comment_text[:500] if comment_text else None,
            status="pending_actions",
            is_connected=is_connected,
            replied_to_comment=already_replied,
            # manually_replied is sticky — it records the state at detection
            # time so the handler can tell "user handled this" from "bot
            # already replied during a retry". Drives the skip-DM short-circuit.
            manually_replied=already_replied,
        )
        db.add(lmc)
        lm.total_processed = (lm.total_processed or 0) + 1
        new_matches += 1
        stats["new"] += 1
        _log_action(db, lm.id, None, "lm_comment_detected", "success", f"Keyword '{lm.keyword}' matched")

    # Save processed IDs
    lm.processed_comment_ids = json.dumps(list(processed_ids))
    db.commit()

    print(f"[LEAD MAGNET] #{lm.id}: scan done — {stats}", flush=True)
    if new_matches > 0:
        print(f"[LEAD MAGNET] #{lm.id}: {new_matches} new keyword matches detected", flush=True)


async def _phase_check_connections(db, lm, client):
    """Check if pending connections have been accepted (also accept incoming invitations)."""
    pending = db.query(LeadMagnetContact).filter(
        LeadMagnetContact.lead_magnet_id == lm.id,
        LeadMagnetContact.status == "connection_sent",
    ).all()

    if not pending:
        return

    # Fetch pending invitations once for all contacts
    pending_urn_ids = {lmc.commenter_urn_id for lmc in pending}
    invitations_by_urn = {}
    try:
        invitations = await get_invitations(client, limit=100)
        for inv in invitations:
            inv_from = inv.get("fromMember") or inv.get("*fromMember") or ""
            inv_urn_id = inv_from.split(":")[-1] if ":" in str(inv_from) else str(inv_from)
            if inv_urn_id in pending_urn_ids:
                invitations_by_urn[inv_urn_id] = inv
    except Exception:
        pass

    for lmc in pending:
        # Check if they sent us an invitation → accept it
        inv = invitations_by_urn.get(lmc.commenter_urn_id)
        if inv:
            inv_entity_urn = inv.get("entityUrn") or ""
            inv_secret = inv.get("sharedSecret") or ""
            if inv_entity_urn and inv_secret:
                try:
                    ok = await accept_invitation(client, inv_entity_urn, inv_secret)
                    if ok:
                        lmc.status = "dm_pending"
                        lmc.connection_accepted_at = datetime.utcnow()
                        lmc.is_connected = True
                        _log_action(db, lm.id, None, "lm_invitation_accepted", "success",
                                    f"Accepted invitation from {lmc.commenter_name}")
                        print(f"[LEAD MAGNET] #{lm.id}: accepted invitation from {lmc.commenter_name}", flush=True)
                        continue
                except Exception as exc:
                    logger.warning("Failed to accept invitation from %s: %s", lmc.commenter_urn_id, exc)

        # Otherwise check profile distance
        try:
            profile = await get_profile(client, urn_id=lmc.commenter_urn_id)
            distance = profile.get("distance")
            if distance in (1, "DISTANCE_1", "1"):
                lmc.status = "dm_pending"
                lmc.connection_accepted_at = datetime.utcnow()
                lmc.is_connected = True
                _log_action(db, lm.id, None, "lm_connection_accepted", "success")
                print(f"[LEAD MAGNET] #{lm.id}: connection accepted by {lmc.commenter_name}", flush=True)
            elif lmc.connection_sent_at and datetime.utcnow() - lmc.connection_sent_at > timedelta(days=CONNECTION_WAIT_DAYS):
                lmc.status = "failed"
                _log_action(db, lm.id, None, "lm_connection_timeout", "failed", "Connection not accepted after 7 days")
        except Exception as exc:
            logger.warning("Failed to check connection for %s: %s", lmc.commenter_urn_id, exc)

    db.commit()


async def _phase_process_actions(db, lm, client):
    """Process pending actions: like, reply, DM, connection request."""
    to_process = db.query(LeadMagnetContact).filter(
        LeadMagnetContact.lead_magnet_id == lm.id,
        LeadMagnetContact.status.in_(["pending_actions", "dm_pending"]),
    ).order_by(LeadMagnetContact.created_at.asc()).all()

    action_count = 0
    for lmc in to_process:
        # Spacing between actions
        if action_count > 0:
            await asyncio.sleep(lm.action_interval_seconds)

        # Re-check lead magnet status (may have been paused mid-tick)
        db.refresh(lm)
        if lm.status != "running":
            break

        try:
            if lmc.is_connected and lmc.status == "pending_actions":
                await _handle_connected(db, lm, lmc, client)
            elif not lmc.is_connected and lmc.status == "pending_actions":
                await _handle_not_connected(db, lm, lmc, client)
            elif lmc.status == "dm_pending":
                await _handle_dm_pending(db, lm, lmc, client)
            action_count += 1
        except Exception as exc:
            logger.warning("Error processing lead magnet contact %d: %s", lmc.id, exc)
            _log_action(db, lm.id, None, "lm_action_error", "failed", str(exc)[:300])

        db.commit()


async def _handle_connected(db, lm, lmc, client):
    """Connected commenter: like comment + reply + send DM."""
    # 1. Like comment
    if not lmc.liked_comment and lmc.comment_urn:
        try:
            ok = await like_comment(client, lmc.comment_urn)
            if ok:
                lmc.liked_comment = True
                lm.total_likes = (lm.total_likes or 0) + 1
                _log_action(db, lm.id, None, "lm_like_comment", "success")
        except Exception as exc:
            _log_action(db, lm.id, None, "lm_like_comment", "failed", str(exc)[:200])

    # Short-circuit when the user already replied manually. They have almost
    # certainly already sent the resource themselves, so skip reply + DM to
    # avoid a duplicate send.
    if lmc.manually_replied:
        _log_action(db, lm.id, None, "lm_skip_manual", "success",
                    f"Manual reply detected, skipping DM for {lmc.commenter_name}")
        print(f"[LEAD MAGNET] #{lm.id}: skip {lmc.commenter_name} — manually replied", flush=True)
        lmc.status = "completed"
        return

    # 2. Reply to comment
    if not lmc.replied_to_comment and lm.reply_template_connected and lmc.comment_urn:
        try:
            reply_text = _render(lm.reply_template_connected, lmc.commenter_name)
            ok = await reply_to_comment(client, lm.post_activity_urn, lmc.comment_urn, reply_text)
            if ok:
                lmc.replied_to_comment = True
                lm.total_replies_sent = (lm.total_replies_sent or 0) + 1
                _log_action(db, lm.id, None, "lm_reply_comment", "success")
        except Exception as exc:
            _log_action(db, lm.id, None, "lm_reply_comment", "failed", str(exc)[:200])

    # 3. Send DM
    if not lmc.dm_sent and lm.dm_template:
        try:
            dm_text = _render(lm.dm_template, lmc.commenter_name)
            ok = await send_message(client, lmc.commenter_urn_id, dm_text)
            if ok:
                lmc.dm_sent = True
                lmc.dm_sent_at = datetime.utcnow()
                lm.total_dm_sent = (lm.total_dm_sent or 0) + 1
                _log_action(db, lm.id, None, "lm_dm_send", "success")
                print(f"[LEAD MAGNET] #{lm.id}: DM sent to {lmc.commenter_name}", flush=True)
            else:
                _log_action(db, lm.id, None, "lm_dm_send", "failed", "LinkedIn returned error")
        except Exception as exc:
            _log_action(db, lm.id, None, "lm_dm_send", "failed", str(exc)[:200])

    lmc.status = "completed"


async def _handle_not_connected(db, lm, lmc, client):
    """Non-connected commenter: check for pending invitation, like, reply, connect/DM."""
    # 0. Check if this person already sent US a connection request → accept it
    invitation_accepted = False
    try:
        invitations = await get_invitations(client, limit=100)
        for inv in invitations:
            inv_from = inv.get("fromMember") or inv.get("*fromMember") or ""
            inv_urn_id = inv_from.split(":")[-1] if ":" in str(inv_from) else str(inv_from)
            if inv_urn_id == lmc.commenter_urn_id:
                inv_entity_urn = inv.get("entityUrn") or ""
                inv_secret = inv.get("sharedSecret") or ""
                if inv_entity_urn and inv_secret:
                    ok = await accept_invitation(client, inv_entity_urn, inv_secret)
                    if ok:
                        invitation_accepted = True
                        lmc.is_connected = True
                        lmc.connection_accepted_at = datetime.utcnow()
                        _log_action(db, lm.id, None, "lm_invitation_accepted", "success",
                                    f"Accepted invitation from {lmc.commenter_name}")
                        print(f"[LEAD MAGNET] #{lm.id}: accepted invitation from {lmc.commenter_name}", flush=True)
                break
    except Exception as exc:
        logger.warning("Failed to check/accept invitations for lead magnet %d: %s", lm.id, exc)

    # 1. Like comment
    if not lmc.liked_comment and lmc.comment_urn:
        try:
            ok = await like_comment(client, lmc.comment_urn)
            if ok:
                lmc.liked_comment = True
                lm.total_likes = (lm.total_likes or 0) + 1
                _log_action(db, lm.id, None, "lm_like_comment", "success")
        except Exception as exc:
            _log_action(db, lm.id, None, "lm_like_comment", "failed", str(exc)[:200])

    # Short-circuit when the user already replied manually. No reply, no
    # connection request, no DM — the user has handled this lead by hand.
    if lmc.manually_replied:
        _log_action(db, lm.id, None, "lm_skip_manual", "success",
                    f"Manual reply detected, skipping bot actions for {lmc.commenter_name}")
        print(f"[LEAD MAGNET] #{lm.id}: skip {lmc.commenter_name} — manually replied", flush=True)
        lmc.status = "completed"
        return

    # If invitation accepted → treat as connected: reply with connected template + send DM
    if invitation_accepted:
        if not lmc.replied_to_comment and lm.reply_template_connected and lmc.comment_urn:
            try:
                reply_text = _render(lm.reply_template_connected, lmc.commenter_name)
                ok = await reply_to_comment(client, lm.post_activity_urn, lmc.comment_urn, reply_text)
                if ok:
                    lmc.replied_to_comment = True
                    lm.total_replies_sent = (lm.total_replies_sent or 0) + 1
                    _log_action(db, lm.id, None, "lm_reply_comment", "success")
            except Exception as exc:
                _log_action(db, lm.id, None, "lm_reply_comment", "failed", str(exc)[:200])

        if not lmc.dm_sent and lm.dm_template:
            try:
                dm_text = _render(lm.dm_template, lmc.commenter_name)
                ok = await send_message(client, lmc.commenter_urn_id, dm_text)
                if ok:
                    lmc.dm_sent = True
                    lmc.dm_sent_at = datetime.utcnow()
                    lm.total_dm_sent = (lm.total_dm_sent or 0) + 1
                    _log_action(db, lm.id, None, "lm_dm_send", "success")
                    print(f"[LEAD MAGNET] #{lm.id}: DM sent to {lmc.commenter_name} (invitation accepted)", flush=True)
            except Exception as exc:
                _log_action(db, lm.id, None, "lm_dm_send", "failed", str(exc)[:200])

        lmc.status = "completed"
        return

    # 2. Reply to comment (not connected template)
    if not lmc.replied_to_comment and lm.reply_template_not_connected and lmc.comment_urn:
        try:
            reply_text = _render(lm.reply_template_not_connected, lmc.commenter_name)
            ok = await reply_to_comment(client, lm.post_activity_urn, lmc.comment_urn, reply_text)
            if ok:
                lmc.replied_to_comment = True
                lm.total_replies_sent = (lm.total_replies_sent or 0) + 1
                _log_action(db, lm.id, None, "lm_reply_comment", "success")
        except Exception as exc:
            _log_action(db, lm.id, None, "lm_reply_comment", "failed", str(exc)[:200])

    # 3. Send connection request
    try:
        await send_connection_request(client, lmc.commenter_urn_id, message=lm.connection_message)
        lmc.status = "connection_sent"
        lmc.connection_sent_at = datetime.utcnow()
        lm.total_connections_sent = (lm.total_connections_sent or 0) + 1
        _log_action(db, lm.id, None, "lm_connection_request", "success")
        print(f"[LEAD MAGNET] #{lm.id}: connection request sent to {lmc.commenter_name}", flush=True)
    except Exception as exc:
        _log_action(db, lm.id, None, "lm_connection_request", "failed", str(exc)[:200])
        lmc.status = "failed"


async def _handle_dm_pending(db, lm, lmc, client):
    """Connection accepted — send DM now."""
    if not lmc.dm_sent and lm.dm_template:
        try:
            dm_text = _render(lm.dm_template, lmc.commenter_name)
            ok = await send_message(client, lmc.commenter_urn_id, dm_text)
            if ok:
                lmc.dm_sent = True
                lmc.dm_sent_at = datetime.utcnow()
                lm.total_dm_sent = (lm.total_dm_sent or 0) + 1
                _log_action(db, lm.id, None, "lm_dm_send", "success")
                print(f"[LEAD MAGNET] #{lm.id}: DM sent to {lmc.commenter_name} (after connection)", flush=True)
            else:
                _log_action(db, lm.id, None, "lm_dm_send", "failed", "LinkedIn returned error")
        except Exception as exc:
            _log_action(db, lm.id, None, "lm_dm_send", "failed", str(exc)[:200])

    lmc.status = "completed"
