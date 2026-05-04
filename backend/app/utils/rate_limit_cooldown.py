"""Per-user LinkedIn rate-limit cooldown.

When LinkedIn returns FUSE_LIMIT_EXCEEDED / 429 on a connection request or DM,
ONLY that user's account is throttled. Other users keep running. Lead magnets
are exempt for everyone (don't trigger, don't respect).

Storage: app_settings rows with user_id set per testeur. Reads/writes go through
app.utils.settings.get_setting / set_setting which already handle the
user_id NULL fallback gracefully (we always pass user_id != None here).
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.utils.settings import set_setting

COOLDOWN_HOURS = 15
KEY_CONNECTIONS = "cooldown_connections_until"
KEY_DMS = "cooldown_dms_until"


def is_rate_limit_error(exc: BaseException) -> bool:
    err = str(exc)
    return "FUSE_LIMIT_EXCEEDED" in err or "status code 429" in err


def trigger_connections_cooldown(db: Session, user_id: int) -> datetime:
    until = datetime.now(timezone.utc) + timedelta(hours=COOLDOWN_HOURS)
    set_setting(db, user_id, KEY_CONNECTIONS, until.isoformat())
    return until


def trigger_dms_cooldown(db: Session, user_id: int) -> datetime:
    until = datetime.now(timezone.utc) + timedelta(hours=COOLDOWN_HOURS)
    set_setting(db, user_id, KEY_DMS, until.isoformat())
    return until


def get_cooldown_until(db: Session, family: str, user_id: int) -> Optional[datetime]:
    """Read THIS user's cooldown only. Never falls back to a global default —
    a global cooldown would block every user, defeating per-user isolation."""
    if user_id is None:
        return None
    from app.models import AppSettings
    key = KEY_CONNECTIONS if family == "connections" else KEY_DMS
    row = db.query(AppSettings).filter(
        AppSettings.key == key, AppSettings.user_id == user_id,
    ).first()
    if not row or not row.value:
        return None
    try:
        until = datetime.fromisoformat(row.value)
    except Exception:
        return None
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if until <= datetime.now(timezone.utc):
        return None
    return until


def is_in_cooldown(db: Session, family: str, user_id: int) -> bool:
    return get_cooldown_until(db, family, user_id) is not None


def get_status(db: Session, user_id: int) -> dict:
    c = get_cooldown_until(db, "connections", user_id)
    d = get_cooldown_until(db, "dms", user_id)
    return {
        "connections_until": c.isoformat() if c else None,
        "dms_until": d.isoformat() if d else None,
        "cooldown_hours": COOLDOWN_HOURS,
    }


def family_for_campaign_type(campaign_type: str) -> Optional[str]:
    if campaign_type == "lead_magnet":
        return None
    if campaign_type == "connection":
        return "connections"
    if campaign_type == "dm":
        return "dms"
    if campaign_type in ("connection_dm", "search_connection_dm"):
        return "both"
    return None


def is_campaign_blocked(db: Session, campaign_type: str, user_id: Optional[int]) -> Optional[str]:
    """Return the family name blocking this user's campaign, or None if it can run."""
    if user_id is None:
        return None
    family = family_for_campaign_type(campaign_type)
    if family is None:
        return None
    if family == "both":
        if is_in_cooldown(db, "connections", user_id):
            return "connections"
        if is_in_cooldown(db, "dms", user_id):
            return "dms"
        return None
    return family if is_in_cooldown(db, family, user_id) else None
