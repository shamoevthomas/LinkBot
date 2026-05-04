"""Backfill missing profile pictures for contacts that LinkedIn search didn't
include image data for.

Runs as a slow drip in the background — small batch per tick, jittered delay
between fetches, capped per-user — so we never look like a scraper.
"""
import asyncio
import logging
import random
from typing import List

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Contact, CRM, User
from app.linkedin_service import (
    get_linkedin_client,
    get_profile,
    extract_profile_picture_url,
)

logger = logging.getLogger(__name__)

BATCH_PER_TICK = 20          # profiles per user per tick
INTER_FETCH_MIN_SEC = 4      # minimum seconds between profile fetches
INTER_FETCH_MAX_SEC = 9      # maximum seconds between profile fetches


def _pick_contacts_missing_picture(db: Session, user_id: int, limit: int) -> List[Contact]:
    return (
        db.query(Contact)
        .join(CRM, Contact.crm_id == CRM.id)
        .filter(
            CRM.user_id == user_id,
            Contact.profile_picture_url.is_(None),
            Contact.public_id.isnot(None),
            Contact.deleted_at.is_(None),
        )
        .order_by(Contact.created_at.desc())
        .limit(limit)
        .all()
    )


async def _enrich_for_user(user: User, batch: int) -> int:
    """Fetch missing pictures for one user. Returns number updated."""
    if not user.li_at_cookie or not user.cookies_valid:
        return 0
    client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

    db = SessionLocal()
    updated = 0
    try:
        contacts = _pick_contacts_missing_picture(db, user.id, batch)
        if not contacts:
            return 0

        for contact in contacts:
            try:
                profile = await get_profile(client, public_id=contact.public_id)
                pic = extract_profile_picture_url(profile or {})
                if pic:
                    contact.profile_picture_url = pic
                    updated += 1
            except Exception:
                logger.exception(
                    "enrich_pictures: failed for contact %d (%s)",
                    contact.id, contact.public_id,
                )
            finally:
                db.commit()
                await asyncio.sleep(random.uniform(INTER_FETCH_MIN_SEC, INTER_FETCH_MAX_SEC))
    finally:
        db.close()

    if updated:
        logger.info("enrich_pictures: user %d → %d pictures", user.id, updated)
    return updated


async def run_enrich_pictures() -> None:
    """Pick a small batch of contacts per user with valid cookies and fill
    their missing profile pictures."""
    db = SessionLocal()
    try:
        users = db.query(User).filter(
            User.cookies_valid == True,  # noqa: E712
            User.li_at_cookie.isnot(None),
        ).all()
    finally:
        db.close()

    for user in users:
        try:
            await _enrich_for_user(user, BATCH_PER_TICK)
        except Exception:
            logger.exception("enrich_pictures: error for user %d", user.id)
