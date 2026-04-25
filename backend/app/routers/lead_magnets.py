"""
Lead Magnet routes: CRUD + control (start/pause/resume/cancel).
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models import User, LeadMagnet, LeadMagnetContact, CampaignAction
from app.schemas import (
    LeadMagnetCreate,
    LeadMagnetUpdate,
    LeadMagnetResponse,
    LeadMagnetContactResponse,
)
from app.utils.post_url_parser import extract_activity_urn
from app.scheduler import (
    schedule_campaign_job,
    pause_campaign_job,
    resume_campaign_job,
    cancel_campaign_job,
    trigger_campaign_now,
    get_campaign_next_run_time,
)

def _lm_key(lm_id: int) -> str:
    """Scheduler key for lead magnets (avoids collision with campaign IDs)."""
    return f"lm_{lm_id}"

router = APIRouter(prefix="/api/lead-magnets", tags=["lead_magnets"])


def _to_response(lm: LeadMagnet) -> LeadMagnetResponse:
    next_run_at = get_campaign_next_run_time(_lm_key(lm.id)) if lm.status == "running" else None
    return LeadMagnetResponse(
        id=lm.id,
        name=lm.name,
        status=lm.status,
        post_url=lm.post_url,
        keyword=lm.keyword,
        check_interval_seconds=lm.check_interval_seconds,
        action_interval_seconds=lm.action_interval_seconds,
        dm_template=lm.dm_template,
        reply_template_connected=lm.reply_template_connected,
        reply_template_not_connected=lm.reply_template_not_connected,
        connection_message=lm.connection_message,
        total_processed=lm.total_processed or 0,
        total_dm_sent=lm.total_dm_sent or 0,
        total_connections_sent=lm.total_connections_sent or 0,
        total_replies_sent=lm.total_replies_sent or 0,
        total_likes=lm.total_likes or 0,
        error_message=lm.error_message,
        started_at=lm.started_at,
        next_run_at=next_run_at,
        created_at=lm.created_at,
    )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=list[LeadMagnetResponse])
def list_lead_magnets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items = (
        db.query(LeadMagnet)
        .filter(LeadMagnet.user_id == user.id)
        .order_by(LeadMagnet.created_at.desc())
        .all()
    )
    return [_to_response(lm) for lm in items]


@router.post("", response_model=LeadMagnetResponse, status_code=status.HTTP_201_CREATED)
def create_lead_magnet(
    body: LeadMagnetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Extract activity URN from post URL
    activity_urn = extract_activity_urn(body.post_url)
    if not activity_urn:
        raise HTTPException(status_code=400, detail="URL de post LinkedIn invalide")

    lm = LeadMagnet(
        user_id=user.id,
        name=body.name,
        status="running",
        started_at=datetime.utcnow(),
        post_url=body.post_url,
        post_activity_urn=activity_urn,
        keyword=body.keyword,
        check_interval_seconds=body.check_interval_seconds,
        action_interval_seconds=body.action_interval_seconds,
        dm_template=body.dm_template,
        reply_template_connected=body.reply_template_connected,
        reply_template_not_connected=body.reply_template_not_connected,
        connection_message=body.connection_message,
    )
    db.add(lm)
    db.commit()
    db.refresh(lm)

    schedule_campaign_job(_lm_key(lm.id), "lead_magnet")
    return _to_response(lm)


@router.get("/{lm_id}", response_model=LeadMagnetResponse)
def get_lead_magnet(
    lm_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id, LeadMagnet.user_id == user.id).first()
    if not lm:
        raise HTTPException(status_code=404, detail="Lead magnet introuvable")
    return _to_response(lm)


@router.patch("/{lm_id}", response_model=LeadMagnetResponse)
def update_lead_magnet(
    lm_id: int,
    body: LeadMagnetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id, LeadMagnet.user_id == user.id).first()
    if not lm:
        raise HTTPException(status_code=404, detail="Lead magnet introuvable")
    if lm.status == "running":
        raise HTTPException(status_code=400, detail="Mettez en pause avant de modifier")

    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "post_url" and value:
            urn = extract_activity_urn(value)
            if not urn:
                raise HTTPException(status_code=400, detail="URL de post LinkedIn invalide")
            lm.post_activity_urn = urn
        setattr(lm, field, value)

    db.commit()
    db.refresh(lm)
    return _to_response(lm)


@router.delete("/{lm_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead_magnet(
    lm_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id, LeadMagnet.user_id == user.id).first()
    if not lm:
        raise HTTPException(status_code=404, detail="Lead magnet introuvable")
    if lm.status == "running":
        cancel_campaign_job(_lm_key(lm.id))
    db.delete(lm)
    db.commit()


# ---------------------------------------------------------------------------
# Control
# ---------------------------------------------------------------------------

@router.post("/{lm_id}/start", response_model=LeadMagnetResponse)
def start_lead_magnet(
    lm_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id, LeadMagnet.user_id == user.id).first()
    if not lm:
        raise HTTPException(status_code=404, detail="Lead magnet introuvable")
    if lm.status not in ("pending", "paused", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Impossible de demarrer (statut: {lm.status})")

    lm.status = "running"
    lm.started_at = lm.started_at or datetime.utcnow()
    lm.error_message = None
    db.commit()

    schedule_campaign_job(_lm_key(lm.id), "lead_magnet")
    return _to_response(lm)


@router.post("/{lm_id}/pause", response_model=LeadMagnetResponse)
def pause_lead_magnet(
    lm_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id, LeadMagnet.user_id == user.id).first()
    if not lm:
        raise HTTPException(status_code=404, detail="Lead magnet introuvable")
    if lm.status != "running":
        raise HTTPException(status_code=400, detail="Non en cours")

    lm.status = "paused"
    db.commit()
    pause_campaign_job(_lm_key(lm.id))
    return _to_response(lm)


@router.post("/{lm_id}/resume", response_model=LeadMagnetResponse)
def resume_lead_magnet(
    lm_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id, LeadMagnet.user_id == user.id).first()
    if not lm:
        raise HTTPException(status_code=404, detail="Lead magnet introuvable")
    if lm.status != "paused":
        raise HTTPException(status_code=400, detail="Non en pause")

    lm.status = "running"
    lm.error_message = None
    db.commit()
    # Always re-register (handles server restart where job was lost from memory)
    schedule_campaign_job(_lm_key(lm.id), "lead_magnet")
    return _to_response(lm)


@router.post("/{lm_id}/cancel", response_model=LeadMagnetResponse)
def cancel_lead_magnet(
    lm_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id, LeadMagnet.user_id == user.id).first()
    if not lm:
        raise HTTPException(status_code=404, detail="Lead magnet introuvable")

    lm.status = "cancelled"
    db.commit()
    cancel_campaign_job(_lm_key(lm.id))
    return _to_response(lm)


@router.post("/{lm_id}/trigger", response_model=LeadMagnetResponse)
def trigger_lead_magnet(
    lm_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id, LeadMagnet.user_id == user.id).first()
    if not lm:
        raise HTTPException(status_code=404, detail="Lead magnet introuvable")
    if lm.status != "running":
        raise HTTPException(status_code=400, detail="Le lead magnet doit être en cours")

    if not trigger_campaign_now(_lm_key(lm.id)):
        # Job lost after server restart — re-register then trigger
        schedule_campaign_job(_lm_key(lm.id), "lead_magnet")
    return _to_response(lm)


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

@router.get("/{lm_id}/contacts", response_model=list[LeadMagnetContactResponse])
def get_lead_magnet_contacts(
    lm_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id, LeadMagnet.user_id == user.id).first()
    if not lm:
        raise HTTPException(status_code=404, detail="Lead magnet introuvable")

    contacts = (
        db.query(LeadMagnetContact)
        .filter(LeadMagnetContact.lead_magnet_id == lm.id)
        .order_by(LeadMagnetContact.created_at.desc())
        .all()
    )

    return [
        LeadMagnetContactResponse(
            id=c.id,
            lead_magnet_id=c.lead_magnet_id,
            commenter_urn_id=c.commenter_urn_id,
            commenter_name=c.commenter_name,
            comment_text=c.comment_text,
            status=c.status,
            is_connected=c.is_connected or False,
            liked_comment=c.liked_comment or False,
            replied_to_comment=c.replied_to_comment or False,
            dm_sent=c.dm_sent or False,
            connection_sent_at=c.connection_sent_at,
            connection_accepted_at=c.connection_accepted_at,
            dm_sent_at=c.dm_sent_at,
            created_at=c.created_at,
        )
        for c in contacts
    ]
