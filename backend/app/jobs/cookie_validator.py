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
# How many consecutive transient results before we call the session dead.
TRANSIENT_RETRIES = 3


async def run_cookie_validation() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.li_at_cookie.isnot(None)).all()
    finally:
        db.close()

    for user in users:
        db = SessionLocal()
        try:
            # A transient result used to be taken at face value, so a dead
            # session — which LinkedIn signals with a redirect loop, the very
            # thing classified as transient — was never detected. Campaigns
            # then ground on against a session that could not work.
            # A genuine glitch does not survive three attempts seconds apart;
            # a dead session fails every single time.
            result = None
            for attempt in range(TRANSIENT_RETRIES):
                try:
                    result = await validate_cookies(user.li_at_cookie, user.jsessionid_cookie or "")
                except Exception:
                    logger.exception("cookie_validator: error testing user %d", user.id)
                    result = None
                if result is not None:
                    break
                if attempt < TRANSIENT_RETRIES - 1:
                    await asyncio.sleep(random.uniform(3, 6))
            if result is None:
                logger.warning(
                    "cookie_validator: user %d returned a transient error %d times in a row "
                    "— treating the session as dead rather than leaving campaigns to fail",
                    user.id, TRANSIENT_RETRIES,
                )
                result = False

            # Re-fetch to update with the latest record
            u = db.query(User).filter(User.id == user.id).first()
            if u is None:
                continue
            # result is now True or False — the retry loop above resolves a
            # persistent transient into False. A single glitch still cannot
            # log anyone out, and the flag flips back on the next successful
            # check, so a false positive self-heals.
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
