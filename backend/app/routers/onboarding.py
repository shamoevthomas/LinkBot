"""
Onboarding route: accepts the initial profile setup via multipart form data.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.storage import upload_file
from app.models import User, CRM, ImportJob
from app.schemas import UserResponse
from app.linkedin_service import validate_cookies

router = APIRouter(prefix="/api/user", tags=["onboarding"])


@router.post("/onboarding", response_model=UserResponse)
async def complete_onboarding(
    background_tasks: BackgroundTasks,
    first_name: str = Form(...),
    last_name: str = Form(...),
    job_role: str = Form(""),
    reason_for_using: str = Form(""),
    linkedin_profile_url: str = Form(""),
    li_at: str = Form(""),
    jsessionid: str = Form(""),
    profile_picture: UploadFile = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Complete the onboarding flow.

    Accepts profile data as multipart form fields, optionally validates
    LinkedIn cookies, saves a profile picture, and marks onboarding as done.
    If import_network is "true", creates a "Mon Réseau" CRM and imports connections.
    """
    # Save profile picture if provided
    picture_path: str | None = user.profile_picture_path
    if profile_picture and profile_picture.filename:
        content = await profile_picture.read()
        picture_path = upload_file(content, profile_picture.filename)

    # Validate LinkedIn cookies if both are provided
    cookies_valid = user.cookies_valid or False
    if li_at and jsessionid:
        cookies_valid = await validate_cookies(li_at, jsessionid)
        user.li_at_cookie = li_at
        user.jsessionid_cookie = jsessionid
        user.cookies_valid = cookies_valid

    # Update user record
    user.first_name = first_name
    user.last_name = last_name
    user.job_role = job_role or user.job_role
    user.reason_for_using = reason_for_using or user.reason_for_using
    user.linkedin_profile_url = linkedin_profile_url or user.linkedin_profile_url
    user.profile_picture_path = picture_path
    user.onboarding_completed = True

    # Always import network when cookies are valid
    if cookies_valid and li_at and jsessionid:
        # Create or find "Mon Réseau" CRM
        crm = db.query(CRM).filter(CRM.name == "Mon Réseau").first()
        if not crm:
            crm = CRM(name="Mon Réseau", description="Toutes vos connexions LinkedIn")
            db.add(crm)
            db.flush()

        # Create import job
        job = ImportJob(crm_id=crm.id, status="running")
        db.add(job)
        db.flush()

        from app.jobs.import_connections import run_import_connections
        background_tasks.add_task(
            run_import_connections,
            crm_id=crm.id,
            li_at=li_at,
            jsessionid=jsessionid,
            import_job_id=job.id,
        )

    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        profile_picture_path=user.profile_picture_path,
        job_role=user.job_role,
        reason_for_using=user.reason_for_using,
        linkedin_profile_url=user.linkedin_profile_url,
        cookies_valid=user.cookies_valid or False,
        onboarding_completed=user.onboarding_completed or False,
    )
