"""
Campaign routes: create, control (pause/resume/cancel), and inspect campaigns.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.orm import Session

from sqlalchemy import func
from app.dependencies import get_db, get_current_user
from app.models import User, Campaign, CampaignAction, CampaignMessage, CampaignContact, CRM, Contact
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


def _campaign_to_response(c: Campaign, db: Session = None) -> CampaignResponse:
    reply_rate = None
    connection_rate = None

    if db and c.type in ("dm", "connection_dm"):
        total_messaged = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id == c.id,
            CampaignContact.status.notin_(["pending", "en_attente"]),
        ).scalar() or 0
        replied = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id == c.id,
            CampaignContact.status == "reussi",
        ).scalar() or 0
        reply_rate = round(replied / total_messaged * 100, 1) if total_messaged > 0 else 0.0

    if db and c.type in ("connection", "connection_dm"):
        if c.type == "connection_dm":
            total_requests = db.query(func.count(CampaignContact.id)).filter(
                CampaignContact.campaign_id == c.id,
                CampaignContact.status != "pending",
            ).scalar() or 0
            accepted = db.query(func.count(CampaignContact.id)).filter(
                CampaignContact.campaign_id == c.id,
                CampaignContact.status.notin_(["pending", "en_attente"]),
            ).scalar() or 0
            connection_rate = round(accepted / total_requests * 100, 1) if total_requests > 0 else 0.0
        else:
            total = (c.total_succeeded or 0) + (c.total_failed or 0)
            connection_rate = round((c.total_succeeded or 0) / total * 100, 1) if total > 0 else 0.0

    # Get next scheduled action time from APScheduler
    next_action_at = None
    if c.status == "running":
        nrt = get_campaign_next_run_time(c.id)
        if nrt:
            # Convert to naive UTC if timezone-aware
            next_action_at = nrt.replace(tzinfo=None) if nrt.tzinfo else nrt

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
        total_processed=c.total_processed or 0,
        total_succeeded=c.total_succeeded or 0,
        total_failed=c.total_failed or 0,
        total_skipped=c.total_skipped or 0,
        max_per_day=c.max_per_day,
        spread_over_days=c.spread_over_days,
        started_at=c.started_at,
        completed_at=c.completed_at,
        created_at=c.created_at,
        error_message=c.error_message,
        reply_rate=reply_rate,
        connection_rate=connection_rate,
        next_action_at=next_action_at,
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
    q = db.query(Campaign)
    if campaign_type:
        q = q.filter(Campaign.type == campaign_type)
    if campaign_status:
        q = q.filter(Campaign.status == campaign_status)
    q = q.order_by(Campaign.created_at.desc())
    return [_campaign_to_response(c, db) for c in q.all()]


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

    # Validate CRM exists
    if body.crm_id:
        crm = db.query(CRM).filter(CRM.id == body.crm_id).first()
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

    campaign = Campaign(
        name=body.name,
        type=body.type,
        status="running",
        crm_id=body.crm_id,
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
    # Validate CRM exists
    crm = db.query(CRM).filter(CRM.id == body.crm_id).first()
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

    followup_count = len(body.messages) - 1 if body.messages else 0

    campaign_type = "connection_dm" if body.is_connection_dm else "dm"

    campaign = Campaign(
        name=body.name,
        type=campaign_type,
        status="running",
        crm_id=body.crm_id,
        keywords=body.keywords if body.is_connection_dm else None,
        message_template=main_template,
        use_ai=body.use_ai,
        full_personalize=body.full_personalize,
        context_text=body.context_text,
        ai_prompt=body.ai_prompt,
        total_target=total_target,
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

    crm = db.query(CRM).filter(CRM.id == body.crm_id).first()
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
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return _campaign_to_response(campaign, db)


@router.post("/{campaign_id}/pause", response_model=CampaignResponse)
def pause_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Pause a running campaign."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
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
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
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
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
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


@router.post("/{campaign_id}/duplicate", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def duplicate_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Create a copy of the campaign with status 'pending'."""
    original = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not original:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    new_campaign = Campaign(
        name=f"{original.name} (copie)",
        type=original.type,
        status="pending",
        crm_id=original.crm_id,
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
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
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
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
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

    return [
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
        )
        for cc, c in rows
    ]
