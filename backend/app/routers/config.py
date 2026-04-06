"""
Configuration and admin routes: settings, CSV import, connection import, logs.
"""

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models import User, CRM, Contact, AppSettings, CampaignAction, ImportJob
from app.schemas import SettingsUpdate, ImportConnectionsRequest, CampaignActionResponse
from app.utils.csv_parser import parse_csv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config", tags=["config"])


# ---------------------------------------------------------------------------
# App Settings
# ---------------------------------------------------------------------------

@router.get("/settings")
def get_settings(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return all application settings as a key-value dict."""
    rows = db.query(AppSettings).all()
    return {row.key: row.value for row in rows}


@router.put("/settings")
def update_settings(
    body: SettingsUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Update application settings.  Only non-null fields are written."""
    updates = body.model_dump(exclude_none=True)
    for key, value in updates.items():
        row = db.query(AppSettings).filter(AppSettings.key == key).first()
        if row:
            row.value = str(value)
        else:
            db.add(AppSettings(key=key, value=str(value)))
    # Auto-set warmup_started_at when warmup is first enabled
    if "warmup_enabled" in updates and str(updates["warmup_enabled"]).lower() == "true":
        started = db.query(AppSettings).filter(AppSettings.key == "warmup_started_at").first()
        if not started or not started.value:
            from datetime import date
            today_str = date.today().isoformat()
            if started:
                started.value = today_str
            else:
                db.add(AppSettings(key="warmup_started_at", value=today_str))

    db.commit()

    rows = db.query(AppSettings).all()
    return {row.key: row.value for row in rows}


# ---------------------------------------------------------------------------
# Import LinkedIn Connections
# ---------------------------------------------------------------------------

@router.post("/import-connections", status_code=status.HTTP_202_ACCEPTED)
def import_connections(
    body: ImportConnectionsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Start a background job to import all LinkedIn connections into a CRM."""
    crm = db.query(CRM).filter(CRM.id == body.crm_id).first()
    if not crm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM not found")

    if not user.li_at_cookie or not user.cookies_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid LinkedIn cookies are required to import connections.",
        )

    # Check if already running
    running = db.query(ImportJob).filter(ImportJob.status == "running").first()
    if running:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An import is already running.",
        )

    # Create import job for tracking
    job = ImportJob(crm_id=body.crm_id, status="running")
    db.add(job)
    db.commit()
    db.refresh(job)

    from app.jobs.import_connections import run_import_connections

    background_tasks.add_task(
        run_import_connections,
        crm_id=body.crm_id,
        li_at=user.li_at_cookie,
        jsessionid=user.jsessionid_cookie,
        import_job_id=job.id,
    )
    return {"message": "Connection import started", "crm_id": body.crm_id, "job_id": job.id}


@router.get("/import-status")
def get_import_status(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get the latest import job status."""
    job = db.query(ImportJob).order_by(ImportJob.id.desc()).first()
    if not job:
        return {"status": "none"}
    import json

    skipped = []
    if job.skipped_details:
        try:
            skipped = json.loads(job.skipped_details)
        except Exception:
            pass

    return {
        "id": job.id,
        "crm_id": job.crm_id,
        "status": job.status,
        "total_found": job.total_found or 0,
        "total_created": job.total_created or 0,
        "total_skipped": job.total_skipped or 0,
        "skipped_details": skipped,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


# ---------------------------------------------------------------------------
# Sync connections (manual trigger)
# ---------------------------------------------------------------------------

@router.post("/sync-connections", status_code=status.HTTP_202_ACCEPTED)
def sync_connections_manual(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually trigger a connection sync: import new connections into 'Mon Réseau'
    and update connection_status across all CRMs."""
    if not user.li_at_cookie or not user.cookies_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid LinkedIn cookies are required.",
        )

    from app.jobs.sync_connections import sync_and_update_statuses

    background_tasks.add_task(
        sync_and_update_statuses,
        li_at=user.li_at_cookie,
        jsessionid=user.jsessionid_cookie,
    )
    return {"message": "Sync started"}


# ---------------------------------------------------------------------------
# CSV Import
# ---------------------------------------------------------------------------

@router.post("/import-csv", status_code=status.HTTP_201_CREATED)
async def import_csv(
    crm_id: int = Form(...),
    column_mapping: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Upload a CSV file, parse it, and insert contacts into the specified CRM."""
    crm = db.query(CRM).filter(CRM.id == crm_id).first()
    if not crm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM not found")

    raw = await file.read()
    try:
        content = raw.decode("utf-8-sig")  # handles BOM automatically
    except UnicodeDecodeError:
        content = raw.decode("latin-1")

    mapping = None
    if column_mapping:
        try:
            mapping = json.loads(column_mapping)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="column_mapping must be valid JSON.",
            )

    try:
        contacts = parse_csv(content, mapping)
    except Exception as exc:
        logger.exception("CSV parse error")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parsing CSV: {exc}",
        )

    if not contacts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid contacts found in CSV.",
        )

    # Pre-load existing urn_ids in this CRM for fast dedup
    existing_urns = set(
        row[0] for row in db.query(Contact.urn_id).filter(Contact.crm_id == crm_id).all()
    )

    created = 0
    skipped = 0
    for c in contacts:
        try:
            # Determine a unique key for this contact
            contact_key = c.get("urn_id") or c.get("public_id") or ""
            linkedin_url = c.get("linkedin_url") or ""

            if not contact_key and not linkedin_url:
                skipped += 1
                continue

            # If no urn_id/public_id, derive from linkedin_url slug
            if not contact_key and linkedin_url:
                if "/in/" in linkedin_url:
                    contact_key = linkedin_url.rstrip("/").split("/in/")[-1].split("?")[0]
                else:
                    contact_key = linkedin_url.rstrip("/").split("/")[-1]

            if not contact_key:
                skipped += 1
                continue

            # Dedup: check DB + already-added in this batch
            if contact_key in existing_urns:
                skipped += 1
                continue

            contact = Contact(
                crm_id=crm_id,
                urn_id=contact_key,
                public_id=c.get("public_id"),
                first_name=c.get("first_name"),
                last_name=c.get("last_name"),
                headline=c.get("headline"),
                location=c.get("location"),
                profile_picture_url=c.get("profile_picture_url"),
                linkedin_url=linkedin_url,
                connection_status=c.get("connection_status", "unknown"),
            )
            db.add(contact)
            existing_urns.add(contact_key)
            created += 1
        except Exception:
            logger.exception("Error processing CSV row: %s", c)
            skipped += 1
            continue

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("DB commit error during CSV import")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Database error: {exc}",
        )

    return {"created": created, "skipped": skipped, "total_rows": len(contacts)}


# ---------------------------------------------------------------------------
# Global action logs
# ---------------------------------------------------------------------------

@router.get("/logs", response_model=list[CampaignActionResponse])
def get_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    campaign_id: Optional[int] = Query(None),
    action_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return a paginated global action log across all campaigns."""
    q = db.query(CampaignAction)
    if campaign_id:
        q = q.filter(CampaignAction.campaign_id == campaign_id)
    if action_status:
        q = q.filter(CampaignAction.status == action_status)

    offset = (page - 1) * page_size
    actions = (
        q.order_by(CampaignAction.created_at.desc())
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
        )
        for a in actions
    ]
