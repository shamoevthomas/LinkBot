"""LinkedIn rate-limit cooldown.

When LinkedIn returns FUSE_LIMIT_EXCEEDED / 429 on a connection request or DM,
the entire account is throttled for that action family. Setting a 15h cooldown
prevents every other campaign of the same family from hammering the API and
piling up more 429s. Lead magnets are exempt (don't trigger, don't respect).
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSettings

COOLDOWN_HOURS = 15
KEY_CONNECTIONS = "cooldown_connections_until"
KEY_DMS = "cooldown_dms_until"


def is_rate_limit_error(exc: BaseException) -> bool:
    err = str(exc)
    return "FUSE_LIMIT_EXCEEDED" in err or "status code 429" in err


def _set(db: Session, key: str, value: str) -> None:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppSettings(key=key, value=value))


def trigger_connections_cooldown(db: Session) -> datetime:
    until = datetime.now(timezone.utc) + timedelta(hours=COOLDOWN_HOURS)
    _set(db, KEY_CONNECTIONS, until.isoformat())
    return until


def trigger_dms_cooldown(db: Session) -> datetime:
    until = datetime.now(timezone.utc) + timedelta(hours=COOLDOWN_HOURS)
    _set(db, KEY_DMS, until.isoformat())
    return until


def get_cooldown_until(db: Session, family: str) -> Optional[datetime]:
    key = KEY_CONNECTIONS if family == "connections" else KEY_DMS
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
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


def is_in_cooldown(db: Session, family: str) -> bool:
    return get_cooldown_until(db, family) is not None


def get_status(db: Session) -> dict:
    c = get_cooldown_until(db, "connections")
    d = get_cooldown_until(db, "dms")
    return {
        "connections_until": c.isoformat() if c else None,
        "dms_until": d.isoformat() if d else None,
        "cooldown_hours": COOLDOWN_HOURS,
    }


def family_for_campaign_type(campaign_type: str) -> Optional[str]:
    """Return which cooldown family blocks this campaign type, or None if exempt."""
    if campaign_type == "lead_magnet":
        return None
    if campaign_type == "connection":
        return "connections"
    if campaign_type == "dm":
        return "dms"
    if campaign_type in ("connection_dm", "search_connection_dm"):
        return "both"
    return None


def is_campaign_blocked(db: Session, campaign_type: str) -> Optional[str]:
    """Return the family name blocking this campaign type, or None if it can run."""
    family = family_for_campaign_type(campaign_type)
    if family is None:
        return None
    if family == "both":
        if is_in_cooldown(db, "connections"):
            return "connections"
        if is_in_cooldown(db, "dms"):
            return "dms"
        return None
    return family if is_in_cooldown(db, family) else None
