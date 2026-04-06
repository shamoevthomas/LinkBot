"""
User routes: profile retrieval, update, and LinkedIn cookie management.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas import UserResponse, CookiesUpdate, CookiesStatus
from app.linkedin_service import validate_cookies
from app.auth import hash_password, verify_password
from app.storage import upload_file

router = APIRouter(prefix="/api/user", tags=["user"])


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
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


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    first_name: str = Form(None),
    last_name: str = Form(None),
    job_role: str = Form(None),
    linkedin_profile_url: str = Form(None),
    current_password: str = Form(None),
    new_password: str = Form(None),
    profile_picture: UploadFile = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update the user's profile (name, job, picture, password)."""
    if first_name is not None:
        user.first_name = first_name
    if last_name is not None:
        user.last_name = last_name
    if job_role is not None:
        user.job_role = job_role
    if linkedin_profile_url is not None:
        user.linkedin_profile_url = linkedin_profile_url

    # Profile picture
    if profile_picture and profile_picture.filename:
        content = await profile_picture.read()
        user.profile_picture_path = upload_file(content, profile_picture.filename)

    # Password change
    if new_password:
        if not current_password:
            raise HTTPException(status_code=400, detail="Mot de passe actuel requis")
        if not verify_password(current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
        if len(new_password) < 6:
            raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit faire au moins 6 caractères")
        user.password_hash = hash_password(new_password)

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


@router.put("/cookies", response_model=CookiesStatus)
async def update_cookies(
    body: CookiesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update the user's LinkedIn session cookies and validate them."""
    valid = await validate_cookies(body.li_at, body.jsessionid)

    user.li_at_cookie = body.li_at
    user.jsessionid_cookie = body.jsessionid
    user.cookies_valid = valid
    db.commit()
    db.refresh(user)

    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LinkedIn cookies are invalid or expired. They have been saved but marked as invalid.",
        )

    return CookiesStatus(valid=valid)


@router.get("/cookies/status", response_model=CookiesStatus)
def cookies_status(user: User = Depends(get_current_user)):
    """Return whether the current user's cookies are valid."""
    return CookiesStatus(valid=user.cookies_valid or False)
