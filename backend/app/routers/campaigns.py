"""
Campaign routes: create, control (pause/resume/cancel), and inspect campaigns.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.orm import Session

from sqlalchemy import func, case
from app.dependencies import get_db, get_current_user
from app.models import User, Campaign, CampaignAction, CampaignMessage, CampaignContact, CRM, Contact, AppSettings
from app.schemas import (
    CampaignCreate,
    CampaignResponse,
    CampaignActionResponse,
    CampaignContactResponse,
    DMCampaignCreate,
    GenerateCampaignMessagesRequest,
    PreviewFullPersonalizationRequest,
)
from app.utils.ai_message import generate_campaign_messages
from app.scheduler import (
    schedule_campaign_job,
    pause_campaign_job,
    resume_campaign_job,
    cancel_campaign_job,
    get_campaign_next_run_time,
)

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


# ---------------------------------------------------------------------------
# Batch helpers — avoid N+1 queries
# ---------------------------------------------------------------------------

def _batch_campaign_stats(campaign_ids: list[int], db: Session) -> dict:
    """Single GROUP BY query returning CampaignContact stats for all campaigns."""
    if not campaign_ids:
        return {}
    rows = db.query(
        CampaignContact.campaign_id,
        func.count(CampaignContact.id).label("total"),
        func.count(case((CampaignContact.status == "reussi", 1))).label("reussi"),
        func.count(case((CampaignContact.status == "perdu", 1))).label("perdu"),
        func.count(case((CampaignContact.main_sent_at.isnot(None), 1))).label("sent"),
        func.count(case((CampaignContact.status.like("relance_%"), 1))).label("relance"),
        func.count(case((CampaignContact.status.notin_(["pending", "en_attente"]), 1))).label("messaged"),
        func.count(case((CampaignContact.status != "pending", 1))).label("not_pending"),
        func.count(case((CampaignContact.status == "demande_envoyee", 1))).label("demande_envoyee"),
    ).filter(
        CampaignContact.campaign_id.in_(campaign_ids)
    ).group_by(CampaignContact.campaign_id).all()

    return {r.campaign_id: {
        "total": r.total, "reussi": r.reussi, "perdu": r.perdu,
        "sent": r.sent, "relance": r.relance,
        "messaged": r.messaged, "not_pending": r.not_pending,
        "demande_envoyee": r.demande_envoyee,
    } for r in rows}

_EMPTY_STATS = {"total": 0, "reussi": 0, "perdu": 0, "sent": 0, "relance": 0, "messaged": 0, "not_pending": 0, "demande_envoyee": 0}


def _compute_limit_info(db: Session) -> dict:
    """Pre-compute schedule/limit info (same for all campaigns in a single request)."""
    from app.scheduler import is_within_schedule, get_global_actions_today, get_effective_daily_limit, get_next_schedule_start

    settings = {s.key: s.value for s in db.query(AppSettings).filter(
        AppSettings.key.in_(["max_dms_per_day", "max_connections_per_day"])
    ).all()}

    within_schedule = is_within_schedule(db)
    dm_limit = get_effective_daily_limit(int(settings.get("max_dms_per_day", 50)), db)
    dm_used = get_global_actions_today(["dm_send"], db)
    conn_limit = get_effective_daily_limit(int(settings.get("max_connections_per_day", 25)), db)
    conn_used = get_global_actions_today(["connection_request"], db)
    next_schedule_start = get_next_schedule_start(db) if not within_schedule else None

    return {
        "within_schedule": within_schedule,
        "dm_limit": dm_limit, "dm_used": dm_used,
        "conn_limit": conn_limit, "conn_used": conn_used,
        "next_schedule_start": next_schedule_start,
    }


def _campaign_to_response(c: Campaign, db: Session = None, stats: dict = None, limit_info: dict = None) -> CampaignResponse:
    # Use pre-computed stats or fall back to single-campaign query
    if stats is None and db:
        stats = _batch_campaign_stats([c.id], db).get(c.id, _EMPTY_STATS)
    elif stats is None:
        stats = _EMPTY_STATS

    reply_rate = None
    connection_rate = None

    if db and c.type in ("dm", "connection_dm"):
        messaged = stats["messaged"]
        replied = stats["reussi"]
        reply_rate = round(replied / messaged * 100, 1) if messaged > 0 else None

    if db and c.type in ("connection", "connection_dm"):
        if c.type == "connection_dm":
            total_requests = stats["not_pending"]
            accepted = stats["messaged"]
            connection_rate = round(accepted / total_requests * 100, 1) if total_requests > 0 else None
        else:
            sent = stats["demande_envoyee"] + stats["reussi"]
            accepted = stats["reussi"]
            connection_rate = round(accepted / sent * 100, 1) if sent > 0 else None

    # Schedule / limit info
    next_action_at = None
    paused_reason = None
    if c.status == "running":
        if limit_info is None and db:
            limit_info = _compute_limit_info(db)

        nrt = get_campaign_next_run_time(c.id)
        if nrt:
            from datetime import timezone
            next_action_at = nrt.replace(tzinfo=timezone.utc)
        else:
            paused_reason = "Aucun job programme — redemarrez la campagne"

        if limit_info and not limit_info["within_schedule"]:
            ns = limit_info["next_schedule_start"]
            next_action_at = ns if ns else None
            paused_reason = "Hors de la fenetre horaire programmee"
        elif limit_info:
            if c.type == "dm" and limit_info["dm_used"] >= limit_info["dm_limit"]:
                paused_reason = f"Limite quotidienne atteinte ({limit_info['dm_used']}/{limit_info['dm_limit']} DMs)"
            elif c.type in ("connection", "connection_dm") and limit_info["conn_used"] >= limit_info["conn_limit"]:
                paused_reason = f"Limite quotidienne atteinte ({limit_info['conn_used']}/{limit_info['conn_limit']} connexions)"

    # Search campaigns use Campaign model counters (no CampaignContact rows)
    # DM/connection_dm/connection campaigns use CampaignContact-based stats
    uses_campaign_contacts = c.type in ("dm", "connection_dm", "connection")

    return CampaignResponse(
        id=c.id,
        name=c.name,
        type=c.type,
        status=c.status,
        crm_id=c.crm_id,
        keywords=c.keywords,
        message_template=c.message_template,
        use_ai=c.use_ai or False,
        full_personalize=c.full_personalize or False,
        context_text=c.context_text,
        ai_prompt=c.ai_prompt,
        total_target=c.total_target,
        total_processed=stats["total"] if uses_campaign_contacts else (c.total_processed or 0),
        total_succeeded=(stats["demande_envoyee"] + stats["reussi"]) if c.type == "connection" else (stats["reussi"] if uses_campaign_contacts else (c.total_succeeded or 0)),
        total_failed=stats["perdu"] if uses_campaign_contacts else (c.total_failed or 0),
        total_skipped=c.total_skipped or 0,
        total_sent=stats["reussi"] if c.type == "connection" else (stats["sent"] if uses_campaign_contacts else 0),
        total_relance=stats["relance"] if uses_campaign_contacts else 0,
        max_per_day=c.max_per_day,
        spread_over_days=c.spread_over_days,
        started_at=c.started_at,
        completed_at=c.completed_at,
        created_at=c.created_at,
        error_message=c.error_message,
        reply_rate=reply_rate,
        connection_rate=connection_rate,
        next_action_at=next_action_at,
        paused_reason=paused_reason,
    )


# ---------------------------------------------------------------------------
# List / Create
# ---------------------------------------------------------------------------

@router.get("", response_model=list[CampaignResponse])
def list_campaigns(
    campaign_type: Optional[str] = Query(None, alias="type"),
    campaign_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List campaigns with optional type and status filters."""
    q = db.query(Campaign).filter(Campaign.user_id == _user.id)
    if campaign_type:
        q = q.filter(Campaign.type == campaign_type)
    if campaign_status:
        q = q.filter(Campaign.status == campaign_status)
    q = q.order_by(Campaign.created_at.desc())
    campaigns = q.all()
    if not campaigns:
        return []
    # Batch: 1 query for all stats + 1 query for settings/limits
    all_stats = _batch_campaign_stats([c.id for c in campaigns], db)
    limit_info = _compute_limit_info(db)
    return [_campaign_to_response(c, db, stats=all_stats.get(c.id, _EMPTY_STATS), limit_info=limit_info) for c in campaigns]


@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    body: CampaignCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new campaign and start it immediately."""
    # Validate campaign type
    if body.type not in ("search", "dm", "connection"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign type must be 'search', 'dm', or 'connection'.",
        )

    # DM and connection campaigns require a CRM
    if body.type in ("dm", "connection") and not body.crm_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A CRM is required for {body.type} campaigns.",
        )

    # Search campaigns require keywords and a CRM
    if body.type == "search":
        if not body.keywords:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Keywords are required for search campaigns.",
            )
        if not body.crm_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A CRM is required for search campaigns to store results.",
            )

    # DM campaigns require a message template
    if body.type == "dm" and not body.message_template:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A message template is required for DM campaigns.",
        )

    # Validate CRM exists and belongs to user
    if body.crm_id:
        crm = db.query(CRM).filter(CRM.id == body.crm_id, CRM.user_id == user.id).first()
        if not crm:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="CRM not found.",
            )

    # Validate cookies
    if not user.li_at_cookie or not user.cookies_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid LinkedIn cookies are required to run campaigns.",
        )

    total_target = body.total_target or 50

    # For connection campaigns, use the actual CRM contact count as target
    if body.type == "connection" and body.crm_id:
        crm_count = db.query(Contact).filter(Contact.crm_id == body.crm_id).count()
        if crm_count > 0:
            total_target = crm_count

    campaign = Campaign(
        name=body.name,
        type=body.type,
        status="running",
        crm_id=body.crm_id,
        user_id=user.id,
        keywords=body.keywords,
        message_template=body.message_template,
        use_ai=body.use_ai,
        total_target=total_target,
        started_at=datetime.utcnow(),
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    # Schedule the background job
    schedule_campaign_job(
        campaign_id=campaign.id,
        campaign_type=campaign.type,
    )

    # Auto-create a companion connection campaign if requested
    if body.type == "search" and body.auto_connect and body.crm_id:
        conn_campaign = Campaign(
            name=f"{body.name} — Connexions",
            type="connection",
            status="running",
            crm_id=body.crm_id,
            user_id=user.id,
            total_target=total_target,
            started_at=datetime.utcnow(),
        )
        db.add(conn_campaign)
        db.commit()
        db.refresh(conn_campaign)
        schedule_campaign_job(
            campaign_id=conn_campaign.id,
            campaign_type="connection",
        )

    return _campaign_to_response(campaign, db)


# ---------------------------------------------------------------------------
# DM Campaign with follow-ups
# ---------------------------------------------------------------------------

@router.post("/dm", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_dm_campaign(
    body: DMCampaignCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a DM campaign with main message + follow-up messages."""
    # Validate CRM exists and belongs to user
    crm = db.query(CRM).filter(CRM.id == body.crm_id, CRM.user_id == user.id).first()
    if not crm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CRM not found.",
        )

    # Validate cookies
    if not user.li_at_cookie or not user.cookies_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid LinkedIn cookies are required to run campaigns.",
        )

    # Full personalize mode: AI writes everything, no template needed
    if not body.full_personalize:
        if not body.messages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one message (the main message) is required.",
            )
        main_msg = next((m for m in body.messages if m.sequence == 0), None)
        if not main_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A main message (sequence 0) is required.",
            )
        main_template = main_msg.message_template
    else:
        main_template = ""

    total_target = body.total_target or 50

    # For DM/connection_dm campaigns, use CRM contact count as target
    if body.crm_id:
        crm_count = db.query(Contact).filter(Contact.crm_id == body.crm_id).count()
        if crm_count > 0:
            total_target = crm_count

    followup_count = len(body.messages) - 1 if body.messages else 0

    campaign_type = "connection_dm" if body.is_connection_dm else "dm"

    campaign = Campaign(
        name=body.name,
        type=campaign_type,
        status="running",
        crm_id=body.crm_id,
        user_id=user.id,
        keywords=body.keywords if body.is_connection_dm else None,
        message_template=main_template,
        use_ai=body.use_ai,
        full_personalize=body.full_personalize,
        context_text=body.context_text,
        ai_prompt=body.ai_prompt,
        total_target=total_target,
        dm_delay_hours=body.dm_delay_hours if body.is_connection_dm else 0,
        started_at=datetime.utcnow(),
    )
    db.add(campaign)
    db.flush()  # get campaign.id before creating messages

    # Create CampaignMessage rows
    for msg in body.messages:
        cm = CampaignMessage(
            campaign_id=campaign.id,
            sequence=msg.sequence,
            message_template=msg.message_template,
            delay_days=msg.delay_days,
        )
        db.add(cm)

    db.commit()
    db.refresh(campaign)

    # Schedule the background job (interval auto-calculated from global settings)
    schedule_campaign_job(
        campaign_id=campaign.id,
        campaign_type=campaign_type,
    )

    return _campaign_to_response(campaign, db)


@router.post("/generate-messages")
def generate_messages(
    body: GenerateCampaignMessagesRequest,
    _user: User = Depends(get_current_user),
):
    """Generate main + follow-up message templates using AI."""
    if body.followup_count < 0 or body.followup_count > 7:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="followup_count must be between 0 and 7.",
        )

    messages = generate_campaign_messages(
        ai_prompt=body.ai_prompt,
        context_text=body.context_text or "",
        followup_count=body.followup_count,
        followup_delays=body.followup_delays,
    )

    if not messages:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate messages. Check AI configuration.",
        )

    return {"messages": messages}


@router.post("/preview-personalization")
async def preview_personalization(
    body: PreviewFullPersonalizationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate fully personalized message previews for the first 3 contacts of a CRM.

    Fetches each contact's full LinkedIn profile + posts, then uses AI to
    generate the entire message(s) from scratch.
    """
    import asyncio
    from app.linkedin_service import get_linkedin_client, get_profile, get_profile_posts
    from app.utils.ai_message import generate_full_personalized_messages, extract_post_texts

    crm = db.query(CRM).filter(CRM.id == body.crm_id, CRM.user_id == user.id).first()
    if not crm:
        raise HTTPException(status_code=404, detail="CRM not found")

    if not user.li_at_cookie or not user.cookies_valid:
        raise HTTPException(status_code=400, detail="Valid LinkedIn cookies required")

    contacts = (
        db.query(Contact)
        .filter(Contact.crm_id == body.crm_id)
        .order_by(Contact.added_at.asc())
        .limit(3)
        .all()
    )
    if not contacts:
        raise HTTPException(status_code=400, detail="No contacts in this CRM")

    client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)
    previews = []

    for contact in contacts:
        contact_data = {
            "first_name": contact.first_name,
            "last_name": contact.last_name,
            "headline": contact.headline,
            "location": contact.location,
        }

        profile_data = None
        recent_posts = None
        try:
            profile_data = await get_profile(client, urn_id=contact.urn_id)
        except Exception:
            pass
        try:
            raw_posts = await get_profile_posts(client, urn_id=contact.urn_id, post_count=3)
            recent_posts = extract_post_texts(raw_posts) if raw_posts else None
        except Exception:
            pass

        rendered_messages = await asyncio.to_thread(
            generate_full_personalized_messages,
            contact_data,
            profile_data,
            recent_posts,
            body.context_text,
            body.ai_prompt,
            body.followup_count,
            body.followup_delays,
        )

        previews.append({
            "contact": {
                "id": contact.id,
                "first_name": contact.first_name,
                "last_name": contact.last_name,
                "headline": contact.headline,
                "profile_picture_url": contact.profile_picture_url,
            },
            "messages": rendered_messages,
        })

    return {"previews": previews}


@router.post("/extract-pdf")
async def extract_pdf_text(
    file: UploadFile = File(...),
    _user: User = Depends(get_current_user),
):
    """Extract text content from an uploaded PDF file."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Le fichier doit etre un PDF")

    from PyPDF2 import PdfReader
    import io

    content = await file.read()
    reader = PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()

    if not text:
        raise HTTPException(status_code=400, detail="Impossible d'extraire du texte de ce PDF")

    return {"text": text}


# ---------------------------------------------------------------------------
# Detail / Controls
# ---------------------------------------------------------------------------

@router.get("/{campaign_id}", response_model=CampaignResponse)
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get campaign details with progress."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return _campaign_to_response(campaign, db)


@router.patch("/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    if "name" in body:
        campaign.name = body["name"]
    db.commit()
    db.refresh(campaign)
    return _campaign_to_response(campaign, db)


@router.get("/{campaign_id}/diagnose")
def diagnose_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return diagnostic info about why a campaign may not be making progress."""
    from app.scheduler import is_within_schedule, get_global_actions_today, get_effective_daily_limit, _campaigns

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    issues = []

    # 1. Check scheduler job
    info = _campaigns.get(campaign_id)
    has_job = info is not None
    job_paused = info.get("paused", False) if info else False
    if not has_job:
        issues.append("Aucun job programme dans le scheduler")
    elif job_paused:
        issues.append("Le job est en pause dans le scheduler")

    # 2. Check cookies
    user = _user
    if not user or not user.li_at_cookie:
        issues.append("Pas de cookies LinkedIn configures")
    elif not user.cookies_valid:
        issues.append("Les cookies LinkedIn sont invalides/expires")

    # 3. Check schedule window
    if not is_within_schedule(db):
        issues.append("Hors de la fenetre horaire (schedule_enabled=true)")

    # 4. Check daily limits
    dm_types = ["dm_send"] + [f"followup_{i}" for i in range(1, 8)]
    conn_types = ["connection_request"]

    dm_row = db.query(AppSettings).filter(AppSettings.key == "max_dms_per_day").first()
    dm_limit = get_effective_daily_limit(int(dm_row.value) if dm_row else 50, db)
    dm_used = get_global_actions_today(dm_types, db)

    conn_row = db.query(AppSettings).filter(AppSettings.key == "max_connections_per_day").first()
    conn_limit = get_effective_daily_limit(int(conn_row.value) if conn_row else 25, db)
    conn_used = get_global_actions_today(conn_types, db)

    if campaign.type in ("dm", "connection_dm") and dm_used >= dm_limit:
        issues.append(f"Limite DM quotidienne atteinte ({dm_used}/{dm_limit})")
    if campaign.type in ("connection", "connection_dm") and conn_used >= conn_limit:
        issues.append(f"Limite connexions quotidienne atteinte ({conn_used}/{conn_limit})")

    # 5. Check CRM contacts
    crm_contact_count = 0
    unprocessed_count = 0
    if campaign.crm_id:
        crm_contact_count = db.query(Contact).filter(Contact.crm_id == campaign.crm_id).count()
        already_ids = (
            db.query(CampaignContact.contact_id)
            .filter(CampaignContact.campaign_id == campaign_id)
            .subquery()
        )
        unprocessed_count = (
            db.query(Contact)
            .filter(Contact.crm_id == campaign.crm_id, ~Contact.id.in_(already_ids))
            .count()
        )
        if crm_contact_count == 0:
            issues.append("Le CRM est vide (aucun contact)")
        elif unprocessed_count == 0:
            issues.append("Tous les contacts du CRM ont deja ete traites")
    else:
        issues.append("Aucun CRM associe a cette campagne")

    # 6. Check campaign messages (for DM types)
    msg_count = 0
    if campaign.type in ("dm", "connection_dm"):
        msg_count = db.query(CampaignMessage).filter(CampaignMessage.campaign_id == campaign_id).count()
        if msg_count == 0 and not campaign.full_personalize:
            issues.append("Aucun message configure pour cette campagne")

    return {
        "campaign_id": campaign_id,
        "status": campaign.status,
        "type": campaign.type,
        "has_scheduler_job": has_job,
        "job_paused": job_paused,
        "next_run_time": str(info["next_run"]) if info else None,
        "cookies_valid": bool(user and user.cookies_valid),
        "within_schedule": is_within_schedule(db),
        "dm_limit": f"{dm_used}/{dm_limit}",
        "conn_limit": f"{conn_used}/{conn_limit}",
        "crm_contacts": crm_contact_count,
        "unprocessed_contacts": unprocessed_count,
        "messages_configured": msg_count,
        "last_error": campaign.error_message,
        "issues": issues,
        "ok": len(issues) == 0,
    }


@router.post("/{campaign_id}/run-now")
async def run_campaign_now(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Manually trigger one tick of the campaign job for debugging."""
    import logging as _log
    _logger = _log.getLogger(__name__)

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status != "running":
        raise HTTPException(status_code=400, detail=f"Campaign status is '{campaign.status}', must be 'running'")

    _logger.info("=== MANUAL RUN: campaign %d type=%s ===", campaign_id, campaign.type)

    try:
        if campaign.type == "dm":
            from app.jobs.dm_campaign import run_dm_campaign
            await run_dm_campaign(campaign_id)
        elif campaign.type == "connection":
            from app.jobs.connection_campaign import run_connection_campaign
            await run_connection_campaign(campaign_id)
        elif campaign.type == "connection_dm":
            from app.jobs.connection_dm_campaign import run_connection_dm_campaign
            await run_connection_dm_campaign(campaign_id)
        elif campaign.type == "search":
            from app.jobs.search_campaign import run_search_campaign
            await run_search_campaign(campaign_id)
        else:
            return {"ok": False, "error": f"Unknown type: {campaign.type}"}

        # Re-read campaign to get updated state
        db.expire_all()
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        return {
            "ok": True,
            "total_processed": campaign.total_processed,
            "total_succeeded": campaign.total_succeeded,
            "total_failed": campaign.total_failed,
            "error_message": campaign.error_message,
        }
    except Exception as exc:
        _logger.exception("Manual run failed for campaign %d", campaign_id)
        return {"ok": False, "error": f"{type(exc).__name__}: {str(exc)[:500]}"}


@router.post("/{campaign_id}/start", response_model=CampaignResponse)
def start_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Start a pending campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == user.id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    if campaign.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start a campaign with status '{campaign.status}'.",
        )

    if not user.li_at_cookie or not user.cookies_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid LinkedIn cookies are required to run campaigns.",
        )

    campaign.status = "running"
    campaign.started_at = datetime.utcnow()
    db.commit()
    db.refresh(campaign)

    schedule_campaign_job(
        campaign_id=campaign.id,
        campaign_type=campaign.type,
    )
    return _campaign_to_response(campaign, db)


@router.post("/{campaign_id}/pause", response_model=CampaignResponse)
def pause_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Pause a running campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    if campaign.status != "running":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot pause a campaign with status '{campaign.status}'.",
        )

    campaign.status = "paused"
    db.commit()
    db.refresh(campaign)

    pause_campaign_job(campaign_id)
    return _campaign_to_response(campaign, db)


@router.post("/{campaign_id}/resume", response_model=CampaignResponse)
def resume_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Resume a paused campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    if campaign.status != "paused":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resume a campaign with status '{campaign.status}'.",
        )

    campaign.status = "running"
    db.commit()
    db.refresh(campaign)

    resume_campaign_job(campaign_id)
    return _campaign_to_response(campaign, db)


@router.post("/{campaign_id}/cancel", response_model=CampaignResponse)
def cancel_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Cancel a running or paused campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    if campaign.status not in ("running", "paused"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a campaign with status '{campaign.status}'.",
        )

    campaign.status = "cancelled"
    campaign.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(campaign)

    cancel_campaign_job(campaign_id)
    return _campaign_to_response(campaign, db)


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Delete a campaign and all its related data (actions, contacts, messages)."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    if campaign.status == "running":
        cancel_campaign_job(campaign_id)
    db.delete(campaign)
    db.commit()


@router.post("/{campaign_id}/duplicate", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def duplicate_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Create a copy of the campaign with status 'pending'."""
    original = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not original:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    new_campaign = Campaign(
        name=f"{original.name} (copie)",
        type=original.type,
        status="pending",
        crm_id=original.crm_id,
        user_id=_user.id,
        keywords=original.keywords,
        message_template=original.message_template,
        use_ai=original.use_ai,
        full_personalize=original.full_personalize,
        context_text=original.context_text,
        ai_prompt=original.ai_prompt,
        total_target=original.total_target,
    )
    db.add(new_campaign)
    db.flush()

    for msg in original.messages:
        db.add(CampaignMessage(
            campaign_id=new_campaign.id,
            sequence=msg.sequence,
            message_template=msg.message_template,
            delay_days=msg.delay_days,
        ))

    db.commit()
    db.refresh(new_campaign)
    return _campaign_to_response(new_campaign, db)


# ---------------------------------------------------------------------------
# Action log
# ---------------------------------------------------------------------------

@router.get("/{campaign_id}/actions", response_model=list[CampaignActionResponse])
def list_actions(
    campaign_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return paginated action log for a campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    offset = (page - 1) * page_size
    rows = (
        db.query(CampaignAction, Contact)
        .outerjoin(Contact, CampaignAction.contact_id == Contact.id)
        .filter(CampaignAction.campaign_id == campaign_id)
        .order_by(CampaignAction.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    return [
        CampaignActionResponse(
            id=a.id,
            campaign_id=a.campaign_id,
            contact_id=a.contact_id,
            action_type=a.action_type,
            status=a.status,
            error_message=a.error_message,
            created_at=a.created_at,
            contact_first_name=c.first_name if c else None,
            contact_last_name=c.last_name if c else None,
            contact_headline=c.headline if c else None,
            contact_location=c.location if c else None,
            contact_profile_picture_url=c.profile_picture_url if c else None,
            contact_linkedin_url=c.linkedin_url if c else None,
            contact_connection_status=c.connection_status if c else None,
        )
        for a, c in rows
    ]


@router.get("/{campaign_id}/contacts", response_model=list[CampaignContactResponse])
def list_campaign_contacts(
    campaign_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return per-contact status for a DM campaign (follow-up cycle tracking)."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    q = (
        db.query(CampaignContact, Contact)
        .outerjoin(Contact, CampaignContact.contact_id == Contact.id)
        .filter(CampaignContact.campaign_id == campaign_id)
    )
    if status_filter:
        q = q.filter(CampaignContact.status == status_filter)

    q = q.order_by(CampaignContact.last_sent_at.desc().nullslast())
    rows = q.all()

    results = [
        CampaignContactResponse(
            id=cc.id,
            campaign_id=cc.campaign_id,
            contact_id=cc.contact_id,
            status=cc.status,
            last_sequence_sent=cc.last_sequence_sent,
            main_sent_at=cc.main_sent_at,
            last_sent_at=cc.last_sent_at,
            replied_at=cc.replied_at,
            contact_first_name=c.first_name if c else None,
            contact_last_name=c.last_name if c else None,
            contact_headline=c.headline if c else None,
            contact_profile_picture_url=c.profile_picture_url if c else None,
            contact_linkedin_url=c.linkedin_url if c else None,
        )
        for cc, c in rows
    ]

    # Include unprocessed CRM contacts as "pending"
    if not status_filter or status_filter == "pending":
        already_ids = {cc.contact_id for cc, _ in rows}
        unprocessed = (
            db.query(Contact)
            .filter(
                Contact.crm_id == campaign.crm_id,
                ~Contact.id.in_(already_ids) if already_ids else True,
            )
            .order_by(Contact.added_at.asc())
            .all()
        )
        for c in unprocessed:
            results.append(CampaignContactResponse(
                id=-c.id,
                campaign_id=campaign_id,
                contact_id=c.id,
                status="pending",
                last_sequence_sent=0,
                contact_first_name=c.first_name,
                contact_last_name=c.last_name,
                contact_headline=c.headline,
                contact_profile_picture_url=c.profile_picture_url,
                contact_linkedin_url=c.linkedin_url,
            ))

    return results


@router.patch("/{campaign_id}/contacts/{contact_id}/status")
def update_campaign_contact_status(
    campaign_id: int,
    contact_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Manually update the status of a campaign contact."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.user_id == _user.id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    cc = db.query(CampaignContact).filter(
        CampaignContact.campaign_id == campaign_id,
        CampaignContact.contact_id == contact_id,
    ).first()
    if not cc:
        raise HTTPException(status_code=404, detail="Contact not found in campaign")

    new_status = body.get("status")
    valid = {"envoye", "reussi", "perdu"} | {f"relance_{i}" for i in range(1, 8)}
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    old_status = cc.status
    cc.status = new_status
    if new_status == "reussi" and not cc.replied_at:
        cc.replied_at = datetime.utcnow()
        campaign.total_succeeded = (campaign.total_succeeded or 0) + 1
    db.commit()
    return {"ok": True, "old_status": old_status, "new_status": new_status}
