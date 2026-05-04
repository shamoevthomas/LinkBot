"""Per-user settings access with global-default fallback.

`app_settings` rows can be:
  - user-specific (user_id IS NOT NULL): override for one user
  - global (user_id IS NULL): default fallback for users with no override

Reads always prefer the user-specific row, falling back to the global default.
Writes always create or update the user-specific row (callers MUST pass user_id).
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSettings


def get_setting(db: Session, user_id: Optional[int], key: str, default: Optional[str] = None) -> Optional[str]:
    """Read a setting. Returns the user's override if present, else the global default, else `default`."""
    if user_id is not None:
        row = db.query(AppSettings).filter(
            AppSettings.key == key, AppSettings.user_id == user_id,
        ).first()
        if row:
            return row.value
    row = db.query(AppSettings).filter(
        AppSettings.key == key, AppSettings.user_id.is_(None),
    ).first()
    return row.value if row else default


def set_setting(db: Session, user_id: Optional[int], key: str, value: str) -> None:
    """Upsert a setting. If user_id is None, writes to the global default row."""
    if user_id is None:
        row = db.query(AppSettings).filter(
            AppSettings.key == key, AppSettings.user_id.is_(None),
        ).first()
    else:
        row = db.query(AppSettings).filter(
            AppSettings.key == key, AppSettings.user_id == user_id,
        ).first()

    if row:
        row.value = str(value)
    else:
        db.add(AppSettings(key=key, value=str(value), user_id=user_id))


def get_user_settings_dict(db: Session, user_id: Optional[int], keys: Optional[list] = None) -> dict:
    """Return a {key: value} dict merging global defaults + user overrides.

    If `keys` is given, only those keys are returned.
    """
    q = db.query(AppSettings)
    if keys:
        q = q.filter(AppSettings.key.in_(keys))
    rows = q.all()

    globals_ = {r.key: r.value for r in rows if r.user_id is None}
    user_specific = {r.key: r.value for r in rows if r.user_id == user_id}
    return {**globals_, **user_specific}
