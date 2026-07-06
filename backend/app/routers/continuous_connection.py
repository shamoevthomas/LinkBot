"""
Continuous Connection — always-on connection-request filler.

One config per user. When the user's daily connection quota isn't consumed by
their running connection campaigns, the background job (jobs/continuous_connection.py)
searches LinkedIn for the configured keywords/regions and sends plain invites
to matching profiles.
"""

import json
from datetime import datetime, date, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models import User, CRM, ContinuousConnection, CampaignAction
from app.schemas import ContinuousConnectionResponse, ContinuousConnectionUpdate

router = APIRouter(prefix="/api/continuous-connection", tags=["continuous_connection"])


CRM_NAME = "Connexion Continue"


def _get_or_create_config(db: Session, user_id: int) -> ContinuousConnection:
    """Fetch the user's config, creating a fresh disabled one if none exists."""
    cfg = db.query(ContinuousConnection).filter(ContinuousConnection.user_id == user_id).first()
    if cfg is None:
        cfg = ContinuousConnection(user_id=user_id, enabled=False, keywords="[]")
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _ensure_crm(db: Session, user_id: int) -> CRM:
    """Get-or-create the "Connexion Continue" CRM for this user."""
    crm = db.query(CRM).filter(CRM.user_id == user_id, CRM.name == CRM_NAME).first()
    if crm is None:
        crm = CRM(
            name=CRM_NAME,
            description="Contacts capturés automatiquement par la Connexion Continue",
            user_id=user_id,
        )
        db.add(crm)
        db.commit()
        db.refresh(crm)
    return crm


def _parse_json_list(raw: str | None) -> List[str]:
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return [str(x) for x in v] if isinstance(v, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _to_response(db: Session, cfg: ContinuousConnection) -> ContinuousConnectionResponse:
    """Serialize a config with the CRM name and today's counter."""
    crm_name = None
    if cfg.crm_id:
        crm = db.query(CRM).filter(CRM.id == cfg.crm_id).first()
        if crm:
            crm_name = crm.name

    today_start = datetime.combine(date.today(), datetime.min.time())
    sent_today = (
        db.query(func.count(CampaignAction.id))
        .filter(
            CampaignAction.continuous_connection_id == cfg.id,
            CampaignAction.action_type == "connection_request",
            CampaignAction.status == "success",
            CampaignAction.created_at >= today_start,
        )
        .scalar()
        or 0
    )

    return ContinuousConnectionResponse(
        id=cfg.id,
        enabled=bool(cfg.enabled),
        keywords=_parse_json_list(cfg.keywords),
        search_regions=_parse_json_list(cfg.search_regions),
        crm_id=cfg.crm_id,
        crm_name=crm_name,
        total_sent=cfg.total_sent or 0,
        sent_today=sent_today,
        last_run_at=cfg.last_run_at,
        last_error=cfg.last_error,
    )


@router.get("", response_model=ContinuousConnectionResponse)
def get_config(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cfg = _get_or_create_config(db, user.id)
    return _to_response(db, cfg)


@router.put("", response_model=ContinuousConnectionResponse)
def update_config(
    body: ContinuousConnectionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Save keywords/regions/enabled. First save auto-creates the destination CRM.

    Enabling requires valid LinkedIn cookies and at least one keyword — same rule
    as launching a campaign; we surface the same French error messages.
    """
    cfg = _get_or_create_config(db, user.id)

    # Normalize inputs.
    if body.keywords is not None:
        cleaned_kw = [k.strip() for k in body.keywords if isinstance(k, str) and k.strip()]
        cfg.keywords = json.dumps(cleaned_kw, ensure_ascii=False)
    if body.search_regions is not None:
        cleaned_r = [r.strip() for r in body.search_regions if isinstance(r, str) and r.strip()]
        cfg.search_regions = json.dumps(cleaned_r, ensure_ascii=False) if cleaned_r else None

    # Validate turning it on.
    if body.enabled is True:
        if not user.li_at_cookie or not user.cookies_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cookies LinkedIn invalides ou manquants. Recollez-les avant d'activer.",
            )
        current_kws = _parse_json_list(cfg.keywords)
        if not current_kws:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ajoute au moins un mot-clé avant d'activer.",
            )
        # Ensure destination CRM exists on activation.
        if not cfg.crm_id:
            crm = _ensure_crm(db, user.id)
            cfg.crm_id = crm.id

    if body.enabled is not None:
        cfg.enabled = bool(body.enabled)

    db.commit()
    db.refresh(cfg)
    return _to_response(db, cfg)
