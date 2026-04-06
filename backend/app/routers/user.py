"""
User routes: profile retrieval and LinkedIn cookie management.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas import UserResponse, CookiesUpdate, CookiesStatus
from app.linkedin_service import validate_cookies

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
