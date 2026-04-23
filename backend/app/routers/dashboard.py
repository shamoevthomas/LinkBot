"""Dashboard stats and notifications."""
import asyncio
import logging
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.dependencies import get_db, get_current_user
from app.models import User, CRM, Contact, Campaign, CampaignAction, CampaignContact, AppSettings, Notification
from app.linkedin_service import get_linkedin_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    # Get user's CRM and campaign IDs for filtering
    user_crm_ids = [c.id for c in db.query(CRM.id).filter(CRM.user_id == _user.id).all()]
    user_campaign_ids = [c.id for c in db.query(Campaign.id).filter(Campaign.user_id == _user.id).all()]

    # Contacts = real LinkedIn network only (connection_status == "connected").
    # Excludes search/campaign prospects, CSV imports without a connection marker, etc.
    if user_crm_ids:
        total_contacts = db.query(func.count(func.distinct(Contact.urn_id))).filter(
            Contact.crm_id.in_(user_crm_ids),
            Contact.connection_status == "connected",
        ).scalar() or 0
        cutoff_14d = datetime.utcnow() - timedelta(days=14)
        contacts_delta_14d = db.query(func.count(func.distinct(Contact.urn_id))).filter(
            Contact.crm_id.in_(user_crm_ids),
            Contact.connection_status == "connected",
            Contact.added_at >= cutoff_14d,
        ).scalar() or 0
    else:
        total_contacts = 0
        contacts_delta_14d = 0
    total_crms = len(user_crm_ids)
    active_campaigns = db.query(func.count(Campaign.id)).filter(Campaign.user_id == _user.id, Campaign.status == "running").scalar() or 0

    today = date.today()
    actions_today = 0
    if user_campaign_ids:
        actions_today = db.query(func.count(CampaignAction.id)).filter(
            CampaignAction.campaign_id.in_(user_campaign_ids),
            func.date(CampaignAction.created_at) == today
        ).scalar() or 0

    # Remaining quotas
    max_conn_row = db.query(AppSettings).filter(AppSettings.key == "max_connections_per_day").first()
    max_dm_row = db.query(AppSettings).filter(AppSettings.key == "max_dms_per_day").first()
    max_conn = int(max_conn_row.value) if max_conn_row else 25
    max_dm = int(max_dm_row.value) if max_dm_row else 50

    conn_today = 0
    dm_today = 0
    if user_campaign_ids:
        conn_today = db.query(func.count(CampaignAction.id)).filter(
            CampaignAction.campaign_id.in_(user_campaign_ids),
            func.date(CampaignAction.created_at) == today,
            CampaignAction.action_type.in_(["connection_request", "connection_send"]),
            CampaignAction.status == "success",
        ).scalar() or 0

        dm_today = db.query(func.count(CampaignAction.id)).filter(
            CampaignAction.campaign_id.in_(user_campaign_ids),
            func.date(CampaignAction.created_at) == today,
            CampaignAction.action_type.in_(["dm_send", "dm_followup"]),
            CampaignAction.status == "success",
        ).scalar() or 0

    # Today's connection acceptances + replies (for the hero line)
    today_accepted = 0
    today_replies = 0
    if user_campaign_ids:
        today_accepted = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(user_campaign_ids),
            CampaignContact.connection_accepted_at.isnot(None),
            func.date(CampaignContact.connection_accepted_at) == today,
        ).scalar() or 0
        today_replies = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(user_campaign_ids),
            CampaignContact.replied_at.isnot(None),
            func.date(CampaignContact.replied_at) == today,
        ).scalar() or 0

    # --- global reply rate (dm + connection_dm campaigns) ---
    dm_campaign_ids = [c.id for c in db.query(Campaign.id).filter(Campaign.user_id == _user.id, Campaign.type.in_(["dm", "connection_dm", "search_connection_dm"])).all()]
    global_reply_rate = 0.0
    if dm_campaign_ids:
        total_messaged = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(dm_campaign_ids),
            CampaignContact.status.notin_(["pending", "en_attente"]),
        ).scalar() or 0
        total_replied = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(dm_campaign_ids),
            CampaignContact.status == "reussi",
        ).scalar() or 0
        global_reply_rate = round(total_replied / total_messaged * 100, 1) if total_messaged > 0 else 0.0

    # --- global connection rate ---
    global_connection_rate = 0.0
    conn_dm_ids = [c.id for c in db.query(Campaign.id).filter(Campaign.user_id == _user.id, Campaign.type.in_(["connection_dm", "search_connection_dm"])).all()]
    conn_only_ids = [c.id for c in db.query(Campaign.id).filter(Campaign.user_id == _user.id, Campaign.type == "connection").all()]
    all_conn_ids = conn_dm_ids + conn_only_ids

    total_conn_requests = 0
    total_conn_accepted = 0
    if all_conn_ids:
        # Sent = all contacts that got a connection request (not just pending in DB)
        total_conn_requests = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(all_conn_ids),
            CampaignContact.status != "pending",
        ).scalar() or 0
        # Accepted = contacts where connection was actually accepted
        total_conn_accepted = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(all_conn_ids),
            CampaignContact.connection_accepted_at.isnot(None),
        ).scalar() or 0
    if total_conn_requests > 0:
        global_connection_rate = round(total_conn_accepted / total_conn_requests * 100, 1)

    recent_campaigns = db.query(Campaign).filter(Campaign.user_id == _user.id).order_by(Campaign.created_at.desc()).limit(5).all()

    # CRM names for campaign display
    crm_name_by_id = {c.id: c.name for c in db.query(CRM).filter(CRM.user_id == _user.id).all()}

    # Per-campaign reply/connection rates for the campaign cards on the dashboard
    def _campaign_rates(c):
        reply_rate = None
        connection_rate = None
        if c.type in ("dm", "connection_dm", "search_connection_dm"):
            messaged = db.query(func.count(CampaignContact.id)).filter(
                CampaignContact.campaign_id == c.id,
                CampaignContact.status.notin_(["pending", "en_attente"]),
            ).scalar() or 0
            replied = db.query(func.count(CampaignContact.id)).filter(
                CampaignContact.campaign_id == c.id,
                CampaignContact.status == "reussi",
            ).scalar() or 0
            reply_rate = round(replied / messaged * 100, 1) if messaged else 0.0
        if c.type in ("connection", "connection_dm", "search_connection_dm"):
            sent = db.query(func.count(CampaignContact.id)).filter(
                CampaignContact.campaign_id == c.id,
                CampaignContact.status != "pending",
            ).scalar() or 0
            accepted = db.query(func.count(CampaignContact.id)).filter(
                CampaignContact.campaign_id == c.id,
                CampaignContact.connection_accepted_at.isnot(None),
            ).scalar() or 0
            connection_rate = round(accepted / sent * 100, 1) if sent else 0.0
        return reply_rate, connection_rate

    recent_actions_q = []
    if user_campaign_ids:
        recent_actions_q = (
            db.query(CampaignAction, Contact, Campaign)
            .outerjoin(Contact, CampaignAction.contact_id == Contact.id)
            .outerjoin(Campaign, CampaignAction.campaign_id == Campaign.id)
            .filter(CampaignAction.campaign_id.in_(user_campaign_ids))
            .order_by(CampaignAction.created_at.desc())
            .limit(8)
            .all()
        )

    return {
        "total_contacts": total_contacts,
        "contacts_delta_14d": contacts_delta_14d,
        "total_crms": total_crms,
        "active_campaigns": active_campaigns,
        "actions_today": actions_today,
        "connections_today": conn_today,
        "connections_limit": max_conn,
        "dms_today": dm_today,
        "dms_limit": max_dm,
        "today_accepted": today_accepted,
        "today_replies": today_replies,
        "remaining_connections": max(0, max_conn - conn_today),
        "remaining_dms": max(0, max_dm - dm_today),
        "global_reply_rate": global_reply_rate,
        "global_connection_rate": global_connection_rate,
        "recent_campaigns": [
            {
                "id": c.id,
                "name": c.name,
                "type": c.type,
                "status": c.status,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "crm_id": c.crm_id,
                "crm_name": crm_name_by_id.get(c.crm_id),
                "total_target": c.total_target,
                "total_processed": c.total_processed or 0,
                "total_succeeded": c.total_succeeded or 0,
                "total_failed": c.total_failed or 0,
                "total_skipped": c.total_skipped or 0,
                "reply_rate": _campaign_rates(c)[0],
                "connection_rate": _campaign_rates(c)[1],
            }
            for c in recent_campaigns
        ],
        "recent_actions": [
            {
                "id": a.id,
                "action_type": a.action_type,
                "status": a.status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "campaign_id": a.campaign_id,
                "campaign_name": camp.name if camp else None,
                "contact_id": a.contact_id,
                "contact_first_name": c.first_name if c else None,
                "contact_last_name": c.last_name if c else None,
                "contact_name": f"{c.first_name or ''} {c.last_name or ''}".strip() if c else None,
                "contact_profile_picture_url": c.profile_picture_url if c else None,
                "contact_linkedin_url": (f"https://www.linkedin.com/in/{c.public_id}" if c and getattr(c, "public_id", None) else None),
            }
            for a, c, camp in recent_actions_q
        ],
    }

def _text(val) -> str:
    """Unwrap LinkedIn i18n wrappers (sometimes firstName is {'localized': {...}})."""
    if val is None:
        return ""
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        # Try localized shape
        loc = val.get("localized")
        if isinstance(loc, dict) and loc:
            first = next(iter(loc.values()), "")
            if isinstance(first, str):
                return first
        for key in ("text", "value", "defaultText"):
            v = val.get(key)
            if isinstance(v, str):
                return v
    return ""


def _extract_picture(node: dict) -> str | None:
    """Extract a usable picture URL from any of the known LinkedIn shapes."""
    if not isinstance(node, dict):
        return None
    # Shape 1: miniProfile.picture = {"com.linkedin.common.VectorImage": {...}}
    vec = node.get("com.linkedin.common.VectorImage")
    # Shape 2: profilePicture.displayImageReference.vectorImage = {...}
    if not vec:
        vec = (node.get("displayImageReference") or {}).get("vectorImage")
    # Shape 3: already the vectorImage itself
    if not vec and ("rootUrl" in node or "artifacts" in node):
        vec = node
    if not isinstance(vec, dict):
        return None
    root = vec.get("rootUrl")
    artifacts = vec.get("artifacts") or []
    if root and artifacts:
        seg = artifacts[-1].get("fileIdentifyingUrlPathSegment")
        if seg:
            return f"{root}{seg}"
    return None


def _extract_miniprofile(me: dict) -> dict:
    """Extract picture_url + name + public_id from a LinkedIn /me payload."""
    mini = me.get("miniProfile") if isinstance(me.get("miniProfile"), dict) else me
    first = _text(mini.get("firstName"))
    last = _text(mini.get("lastName"))
    public_id = _text(mini.get("publicIdentifier"))

    picture_url = (
        _extract_picture(mini.get("picture") or {})
        or _extract_picture(mini.get("profilePicture") or {})
        or _extract_picture(me.get("profilePicture") or {})
    )
    return {
        "first_name": first,
        "last_name": last,
        "public_id": public_id,
        "picture_url": picture_url,
    }


def _empty_profile() -> dict:
    return {"valid": False, "picture_url": None, "first_name": None, "last_name": None, "public_id": None}


def _deep_find_public_id(node, depth=0):
    """Walk the /me response and return the first publicIdentifier we find."""
    if depth > 6:
        return None
    if isinstance(node, dict):
        pid = node.get("publicIdentifier")
        if isinstance(pid, str) and pid:
            return pid
        if isinstance(pid, dict):
            txt = _text(pid)
            if txt:
                return txt
        for v in node.values():
            found = _deep_find_public_id(v, depth + 1)
            if found:
                return found
    elif isinstance(node, list):
        for v in node:
            found = _deep_find_public_id(v, depth + 1)
            if found:
                return found
    return None


def _deep_find_picture(node, depth=0):
    """Walk any payload and try every picture/profilePicture dict we meet."""
    if depth > 6:
        return None
    if isinstance(node, dict):
        for key in ("picture", "profilePicture", "displayImageReference"):
            if key in node:
                url = _extract_picture(node[key] if isinstance(node[key], dict) else {key: node[key]})
                if url:
                    return url
        # vectorImage directly
        if "rootUrl" in node and "artifacts" in node:
            url = _extract_picture(node)
            if url:
                return url
        for v in node.values():
            found = _deep_find_picture(v, depth + 1)
            if found:
                return found
    elif isinstance(node, list):
        for v in node:
            found = _deep_find_picture(v, depth + 1)
            if found:
                return found
    return None


@router.get("/linkedin-profile")
async def linkedin_profile(user: User = Depends(get_current_user)):
    """Return the LinkedIn account owner (picture + name) for the current user's cookies.

    Strategy: /me → public_id → same dash profile endpoint the network sync uses.
    This mirrors how get_all_connections() extracts pictures for contacts.
    """
    if not user.li_at_cookie or not user.cookies_valid:
        return _empty_profile()
    try:
        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

        # Step 1: /me — dump the shape so we can see what LinkedIn sent
        me = await asyncio.to_thread(client.get_user_profile, False)
        if not me:
            logger.warning("LinkedIn /me returned empty payload")
            return _empty_profile()

        # Log the full top-level keys + 1st level of miniProfile if present
        top_keys = list(me.keys()) if isinstance(me, dict) else []
        mini_raw = me.get("miniProfile") if isinstance(me, dict) else None
        mini_keys = list(mini_raw.keys()) if isinstance(mini_raw, dict) else []
        logger.info("linkedin /me top_keys=%s mini_keys=%s", top_keys, mini_keys)

        mini = mini_raw if isinstance(mini_raw, dict) else (me if isinstance(me, dict) else {})
        first_name = _text(mini.get("firstName"))
        last_name = _text(mini.get("lastName"))
        public_id = _text(mini.get("publicIdentifier")) or (_deep_find_public_id(me) or "")
        picture_url = _deep_find_picture(me)

        logger.info(
            "linkedin /me parse: public_id=%r first=%r last=%r picture=%s",
            public_id, first_name, last_name, bool(picture_url),
        )

        # Step 2: user table sometimes has linkedin_profile_url = https://www.linkedin.com/in/<public_id>
        if not public_id and user.linkedin_profile_url:
            try:
                tail = user.linkedin_profile_url.rstrip("/").split("/in/")[-1]
                if tail and "/" not in tail and tail != user.linkedin_profile_url:
                    public_id = tail
                    logger.info("linkedin: recovered public_id from user.linkedin_profile_url=%r", public_id)
            except Exception:
                pass

        # Step 3: full dash profile (same path as network contact extraction)
        if public_id and (not picture_url or not first_name):
            try:
                full = await asyncio.to_thread(client.get_profile, public_id=public_id)
                if isinstance(full, dict) and full:
                    if not first_name:
                        first_name = _text(full.get("firstName"))
                    if not last_name:
                        last_name = _text(full.get("lastName"))
                    # _extract_profile_images puts the rootUrl at `displayPictureUrl`
                    # and artifact segments at `img_W_H` keys.
                    root = full.get("displayPictureUrl")
                    artifact_keys = [k for k in full.keys() if k.startswith("img_")]
                    def _w(k):
                        try:
                            return int(k.split("_")[1])
                        except Exception:
                            return 0
                    artifact_keys.sort(key=_w, reverse=True)
                    if root and artifact_keys and not picture_url:
                        seg = full.get(artifact_keys[0])
                        if seg:
                            picture_url = f"{root}{seg}"
                    logger.info(
                        "linkedin dash profile: picture=%s first=%r full_keys=%s",
                        bool(picture_url), first_name,
                        [k for k in list(full.keys())[:20] if not k.startswith("img_")],
                    )
            except Exception:
                logger.exception("Failed to fetch full LinkedIn profile for %s", public_id)

        return {
            "valid": True,
            "first_name": first_name or None,
            "last_name": last_name or None,
            "public_id": public_id or None,
            "picture_url": picture_url,
        }
    except Exception:
        logger.exception("Failed to fetch LinkedIn profile")
        return _empty_profile()


@router.get("/notifications")
def get_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cutoff = datetime.utcnow() - timedelta(hours=24)
    campaigns_attention = db.query(func.count(Campaign.id)).filter(
        Campaign.user_id == user.id,
        Campaign.status.in_(["completed", "failed"]),
        Campaign.completed_at >= cutoff,
    ).scalar() or 0
    unread_count = db.query(func.count(Notification.id)).filter(
        Notification.user_id == user.id, Notification.read == False
    ).scalar() or 0
    return {
        "campaigns_attention": campaigns_attention,
        "cookies_invalid": not user.cookies_valid,
        "unread_notifications": unread_count,
    }
