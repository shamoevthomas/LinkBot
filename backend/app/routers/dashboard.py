"""Dashboard stats and notifications."""
import asyncio
import logging
from datetime import date, datetime, timedelta
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import func, case
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

    # Quotas — load warmup-related settings in the same query
    from app.scheduler import get_effective_daily_limit, WARMUP_MAX_DAYS
    settings_rows = db.query(AppSettings).filter(
        AppSettings.key.in_([
            "max_connections_per_day", "max_dms_per_day",
            "warmup_enabled", "warmup_start_limit", "warmup_days", "warmup_started_at",
        ])
    ).all()
    settings = {s.key: s.value for s in settings_rows}
    base_conn = int(settings.get("max_connections_per_day", 25))
    base_dm = int(settings.get("max_dms_per_day", 50))
    # Effective limit = what the scheduler actually enforces right now (warmup-adjusted)
    max_conn = get_effective_daily_limit(base_conn, db)
    max_dm = get_effective_daily_limit(base_dm, db)

    # Warmup display metadata — only populated when warmup is active AND in progress
    warmup_info = None
    if settings.get("warmup_enabled", "false").lower() == "true":
        started_at_str = settings.get("warmup_started_at") or ""
        if started_at_str:
            try:
                started_at = date.fromisoformat(started_at_str)
                raw_days = int(settings.get("warmup_days") or WARMUP_MAX_DAYS)
                warmup_days = max(1, min(raw_days, WARMUP_MAX_DAYS))
                elapsed = (today - started_at).days
                if elapsed < warmup_days:
                    target_reached_on = started_at + timedelta(days=warmup_days)
                    warmup_info = {
                        "active": True,
                        "start_limit": int(settings.get("warmup_start_limit") or 5),
                        "days_total": warmup_days,
                        "day_current": elapsed + 1,  # 1-indexed for display
                        "days_remaining": max(0, warmup_days - elapsed),
                        "started_at": started_at_str,
                        "target_reached_on": target_reached_on.isoformat(),
                        "target_conn": base_conn,
                        "target_dm": base_dm,
                        "today_conn_cap": max_conn,
                        "today_dm_cap": max_dm,
                    }
            except (ValueError, TypeError):
                pass

    # Today's actions: one query aggregating actions_today + conn_today + dm_today
    actions_today = conn_today = dm_today = 0
    if user_campaign_ids:
        row = db.query(
            func.count(CampaignAction.id).label("total"),
            func.sum(case(
                (
                    (CampaignAction.action_type.in_(["connection_request", "connection_send"]))
                    & (CampaignAction.status == "success"), 1
                ),
                else_=0,
            )).label("conn"),
            func.sum(case(
                (
                    (CampaignAction.action_type.in_(["dm_send", "dm_followup"]))
                    & (CampaignAction.status == "success"), 1
                ),
                else_=0,
            )).label("dm"),
        ).filter(
            CampaignAction.campaign_id.in_(user_campaign_ids),
            func.date(CampaignAction.created_at) == today,
        ).one()
        actions_today = row.total or 0
        conn_today = int(row.conn or 0)
        dm_today = int(row.dm or 0)

    # Today's accepted + replies on CampaignContact (one query)
    today_accepted = today_replies = 0
    if user_campaign_ids:
        row = db.query(
            func.sum(case(
                (func.date(CampaignContact.connection_accepted_at) == today, 1),
                else_=0,
            )).label("accepted"),
            func.sum(case(
                (func.date(CampaignContact.replied_at) == today, 1),
                else_=0,
            )).label("replies"),
        ).filter(
            CampaignContact.campaign_id.in_(user_campaign_ids),
        ).one()
        today_accepted = int(row.accepted or 0)
        today_replies = int(row.replies or 0)

    # Recent campaigns + their IDs (1 query, reused below)
    recent_campaigns = db.query(Campaign).filter(
        Campaign.user_id == _user.id
    ).order_by(Campaign.created_at.desc()).limit(5).all()

    # Fetch campaign type buckets in one pass (replaces 3 separate ID queries)
    campaign_types = db.query(Campaign.id, Campaign.type).filter(Campaign.user_id == _user.id).all()
    dm_campaign_ids = [cid for cid, ctype in campaign_types if ctype in ("dm", "connection_dm", "search_connection_dm")]
    all_conn_ids = [cid for cid, ctype in campaign_types if ctype in ("connection", "connection_dm", "search_connection_dm")]

    # Global reply rate + connection rate in one CampaignContact scan per bucket
    global_reply_rate = 0.0
    if dm_campaign_ids:
        row = db.query(
            func.sum(case((CampaignContact.status.notin_(["pending", "en_attente"]), 1), else_=0)).label("messaged"),
            func.sum(case((CampaignContact.status == "reussi", 1), else_=0)).label("replied"),
        ).filter(CampaignContact.campaign_id.in_(dm_campaign_ids)).one()
        messaged = int(row.messaged or 0)
        replied = int(row.replied or 0)
        global_reply_rate = round(replied / messaged * 100, 1) if messaged else 0.0

    global_connection_rate = 0.0
    if all_conn_ids:
        row = db.query(
            func.sum(case((CampaignContact.status != "pending", 1), else_=0)).label("sent"),
            func.sum(case((CampaignContact.connection_accepted_at.isnot(None), 1), else_=0)).label("accepted"),
        ).filter(CampaignContact.campaign_id.in_(all_conn_ids)).one()
        sent = int(row.sent or 0)
        accepted = int(row.accepted or 0)
        global_connection_rate = round(accepted / sent * 100, 1) if sent else 0.0

    # CRM names for campaign display
    crm_name_by_id = {c.id: c.name for c in db.query(CRM).filter(CRM.user_id == _user.id).all()}

    # Per-campaign rates: one GROUP BY query for all recent campaigns at once
    # (was N+1: 2 calls × 4 subqueries × 5 campaigns = 40 queries)
    recent_campaign_ids = [c.id for c in recent_campaigns]
    campaign_rates = {}
    if recent_campaign_ids:
        rows = db.query(
            CampaignContact.campaign_id,
            func.sum(case((CampaignContact.status.notin_(["pending", "en_attente"]), 1), else_=0)).label("messaged"),
            func.sum(case((CampaignContact.status == "reussi", 1), else_=0)).label("replied"),
            func.sum(case((CampaignContact.status != "pending", 1), else_=0)).label("conn_sent"),
            func.sum(case((CampaignContact.connection_accepted_at.isnot(None), 1), else_=0)).label("conn_accepted"),
        ).filter(
            CampaignContact.campaign_id.in_(recent_campaign_ids)
        ).group_by(CampaignContact.campaign_id).all()
        campaign_rates = {
            r.campaign_id: {
                "messaged": int(r.messaged or 0),
                "replied": int(r.replied or 0),
                "conn_sent": int(r.conn_sent or 0),
                "conn_accepted": int(r.conn_accepted or 0),
            }
            for r in rows
        }

    def _campaign_rates(c):
        r = campaign_rates.get(c.id, {"messaged": 0, "replied": 0, "conn_sent": 0, "conn_accepted": 0})
        reply_rate = None
        connection_rate = None
        if c.type in ("dm", "connection_dm", "search_connection_dm"):
            reply_rate = round(r["replied"] / r["messaged"] * 100, 1) if r["messaged"] else 0.0
        if c.type in ("connection", "connection_dm", "search_connection_dm"):
            connection_rate = round(r["conn_accepted"] / r["conn_sent"] * 100, 1) if r["conn_sent"] else 0.0
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

    # Compute rates once per recent campaign (was called twice in the list comp)
    recent_campaign_rates = {c.id: _campaign_rates(c) for c in recent_campaigns}

    return {
        "total_contacts": total_contacts,
        "contacts_delta_14d": contacts_delta_14d,
        "total_crms": total_crms,
        "active_campaigns": active_campaigns,
        "actions_today": actions_today,
        "connections_today": conn_today,
        "connections_limit": max_conn,
        "connections_base_limit": base_conn,
        "dms_today": dm_today,
        "dms_limit": max_dm,
        "dms_base_limit": base_dm,
        "warmup": warmup_info,
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
                "reply_rate": recent_campaign_rates[c.id][0],
                "connection_rate": recent_campaign_rates[c.id][1],
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


def _fetch_linkedin_identity(user: User) -> dict | None:
    """Hit LinkedIn /me + /profile and return normalized identity fields.

    Returns None on failure. Keeps the same best-effort parsing path that was
    inline in the endpoint before caching was introduced.
    """
    try:
        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)
        me = client.get_user_profile(False)
        if not me:
            return None

        mini_raw = me.get("miniProfile") if isinstance(me, dict) else None
        mini = mini_raw if isinstance(mini_raw, dict) else (me if isinstance(me, dict) else {})
        first_name = _text(mini.get("firstName"))
        last_name = _text(mini.get("lastName"))
        public_id = _text(mini.get("publicIdentifier")) or (_deep_find_public_id(me) or "")
        picture_url = _deep_find_picture(me)

        if not public_id and user.linkedin_profile_url:
            try:
                tail = user.linkedin_profile_url.rstrip("/").split("/in/")[-1]
                if tail and "/" not in tail and tail != user.linkedin_profile_url:
                    public_id = tail
            except Exception:
                pass

        if public_id and (not picture_url or not first_name):
            try:
                full = client.get_profile(public_id=public_id)
                if isinstance(full, dict) and full:
                    if not first_name:
                        first_name = _text(full.get("firstName"))
                    if not last_name:
                        last_name = _text(full.get("lastName"))
                    root = full.get("displayPictureUrl")
                    artifact_keys = sorted(
                        [k for k in full.keys() if k.startswith("img_")],
                        key=lambda k: int(k.split("_")[1]) if k.split("_")[1].isdigit() else 0,
                        reverse=True,
                    )
                    if root and artifact_keys and not picture_url:
                        seg = full.get(artifact_keys[0])
                        if seg:
                            picture_url = f"{root}{seg}"
            except Exception:
                logger.exception("Failed to fetch full LinkedIn profile for %s", public_id)

        return {
            "first_name": first_name or None,
            "last_name": last_name or None,
            "public_id": public_id or None,
            "picture_url": picture_url,
        }
    except Exception:
        logger.exception("Failed to fetch LinkedIn profile")
        return None


def _refresh_linkedin_cache_sync(user_id: int) -> None:
    """Fetch LinkedIn identity and persist to the user row. Runs in BG."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user_id).first()
        if not u or not u.li_at_cookie or not u.cookies_valid:
            return
        identity = _fetch_linkedin_identity(u)
        if not identity:
            return
        # LinkedIn is the source of truth — overwrite typed-in values so a user
        # can't display "Brad Pitt" while authenticating with someone else's cookies.
        u.first_name = identity.get("first_name") or u.first_name
        u.last_name = identity.get("last_name") or u.last_name
        u.linkedin_picture_url = identity.get("picture_url")
        public_id = identity.get("public_id")
        if public_id:
            u.linkedin_profile_url = f"https://www.linkedin.com/in/{public_id}"
        u.linkedin_cached_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


CACHE_TTL = timedelta(hours=24)


@router.get("/linkedin-profile")
async def linkedin_profile(
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the LinkedIn account owner (cached; refreshed in background).

    Strategy: read picture/name from the user row. If the cache is missing or
    older than 24h, trigger a background refresh so the NEXT dashboard load
    has fresh data — never block the current request on LinkedIn.

    Rationale: the voyager /me + /profile round-trip was the dominant latency
    on dashboard first paint (~2-3s every time, on every page load).
    """
    if not user.li_at_cookie or not user.cookies_valid:
        return _empty_profile()

    cached_at = user.linkedin_cached_at
    stale = (not cached_at) or (datetime.utcnow() - cached_at > CACHE_TTL)
    has_cache = bool(user.linkedin_picture_url or user.first_name)

    if stale:
        # Only schedule the refresh; never block on it.
        background.add_task(_refresh_linkedin_cache_sync, user.id)

    if has_cache:
        return {
            "valid": True,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "public_id": (user.linkedin_profile_url or "").rstrip("/").split("/in/")[-1] or None,
            "picture_url": user.linkedin_picture_url,
        }

    # No cache yet — do the fetch inline this one time so the user sees
    # something on first dashboard visit. Subsequent loads hit the cache.
    identity = await asyncio.to_thread(_fetch_linkedin_identity, user)
    if not identity:
        return _empty_profile()

    # Persist so next request is fast
    try:
        user.first_name = user.first_name or identity.get("first_name")
        user.last_name = user.last_name or identity.get("last_name")
        user.linkedin_picture_url = identity.get("picture_url")
        user.linkedin_cached_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()

    return {
        "valid": True,
        **identity,
    }


@router.get("/rate-limit-status")
def get_rate_limit_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return active LinkedIn rate-limit cooldowns (account-wide, set on 429)."""
    from app.utils.rate_limit_cooldown import get_status
    return get_status(db)


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
