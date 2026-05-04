"""Per-user resource caps for the beta launch.

Soft limits prevent a single tester from spinning up dozens of campaigns
(which makes their dashboard unreadable, burns Gemini quota, and looks
suspicious to LinkedIn). Privileged accounts bypass.

Active = status the user could meaningfully care about pausing/cancelling.
Paused/completed/failed/cancelled don't count.
"""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import User, Campaign, LeadMagnet

# Beta caps
MAX_ACTIVE_CAMPAIGNS_PER_USER = 3
MAX_ACTIVE_LEAD_MAGNETS_PER_USER = 2

# Bypass list. Email match takes priority; username falls back for the
# admin-bypass account that doesn't have a real email.
UNLIMITED_EMAILS = {"shamoevthomas@gmail.com"}
UNLIMITED_USERNAMES = {"TEKA"}

ACTIVE_CAMPAIGN_STATUSES = ("running", "pending")
ACTIVE_LEAD_MAGNET_STATUSES = ("running", "pending")


def is_unlimited(user: User) -> bool:
    return (
        (user.email or "").lower() in {e.lower() for e in UNLIMITED_EMAILS}
        or (user.username or "") in UNLIMITED_USERNAMES
    )


def count_active_campaigns(db: Session, user_id: int) -> int:
    return (
        db.query(Campaign)
        .filter(
            Campaign.user_id == user_id,
            Campaign.status.in_(ACTIVE_CAMPAIGN_STATUSES),
        )
        .count()
    )


def count_active_lead_magnets(db: Session, user_id: int) -> int:
    return (
        db.query(LeadMagnet)
        .filter(
            LeadMagnet.user_id == user_id,
            LeadMagnet.status.in_(ACTIVE_LEAD_MAGNET_STATUSES),
        )
        .count()
    )


def enforce_campaign_limit(db: Session, user: User) -> None:
    if is_unlimited(user):
        return
    active = count_active_campaigns(db, user.id)
    if active >= MAX_ACTIVE_CAMPAIGNS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Limite atteinte : {MAX_ACTIVE_CAMPAIGNS_PER_USER} campagnes actives "
                f"max pendant la beta. Mettez-en une en pause ou terminez-la avant "
                f"d'en créer une nouvelle."
            ),
        )


def enforce_lead_magnet_limit(db: Session, user: User) -> None:
    if is_unlimited(user):
        return
    active = count_active_lead_magnets(db, user.id)
    if active >= MAX_ACTIVE_LEAD_MAGNETS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Limite atteinte : {MAX_ACTIVE_LEAD_MAGNETS_PER_USER} lead magnets "
                f"actifs max pendant la beta. Mettez-en un en pause avant d'en "
                f"créer un nouveau."
            ),
        )


def get_quota_status(db: Session, user: User) -> dict:
    """Return current quota usage for the UI (counter display)."""
    if is_unlimited(user):
        return {
            "unlimited": True,
            "campaigns_used": count_active_campaigns(db, user.id),
            "campaigns_limit": None,
            "lead_magnets_used": count_active_lead_magnets(db, user.id),
            "lead_magnets_limit": None,
        }
    return {
        "unlimited": False,
        "campaigns_used": count_active_campaigns(db, user.id),
        "campaigns_limit": MAX_ACTIVE_CAMPAIGNS_PER_USER,
        "lead_magnets_used": count_active_lead_magnets(db, user.id),
        "lead_magnets_limit": MAX_ACTIVE_LEAD_MAGNETS_PER_USER,
    }
