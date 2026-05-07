"""Periodic cookie re-validation.

Every 2 hours we ping LinkedIn /me with each user's stored cookies. If
LinkedIn rejects them, we flip cookies_valid=False so the dashboard banner
forces a recolle. Spaced (2s between users) so we don't bang LinkedIn from
the server IP all at once.
"""
import asyncio
import logging
import random

from app.database import SessionLocal
from app.models import User
from app.linkedin_service import validate_cookies

logger = logging.getLogger(__name__)

DELAY_BETWEEN_USERS = (2, 5)  # seconds


async def run_cookie_validation() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.li_at_cookie.isnot(None)).all()
    finally:
        db.close()

    for user in users:
        db = SessionLocal()
        try:
            try:
                result = await validate_cookies(user.li_at_cookie, user.jsessionid_cookie or "")
            except Exception:
                logger.exception("cookie_validator: error testing user %d", user.id)
                result = None

            # Re-fetch to update with the latest record
            u = db.query(User).filter(User.id == user.id).first()
            if u is None:
                continue
            # result is True (valid), False (definitely invalid), or None (transient).
            # NEVER flip cookies_valid on None — LinkedIn occasionally returns
            # transient redirect glitches even for healthy sessions, and logging
            # users out on those would force them into a paste-recheck loop.
            if result is None:
                logger.info(
                    "cookie_validator: user %d transient validation error — leaving cookies_valid=%s",
                    user.id, bool(u.cookies_valid),
                )
                continue
            if bool(u.cookies_valid) != result:
                u.cookies_valid = result
                db.commit()
                logger.info(
                    "cookie_validator: user %d cookies_valid -> %s",
                    user.id, result,
                )
        finally:
            db.close()
        await asyncio.sleep(random.uniform(*DELAY_BETWEEN_USERS))
