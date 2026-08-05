"""
User routes: profile retrieval, update, and LinkedIn cookie management.
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models import User, Campaign
from app.schemas import UserResponse, CookiesUpdate, CookiesStatus
from app.scheduler import pause_campaign_job
from app.linkedin_service import validate_cookies
from app.auth import hash_password, verify_password
from app.storage import upload_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])


def _gemini_key_invalid(db: Session, user_id: int) -> bool:
    from app.utils.settings import get_setting
    return (get_setting(db, user_id, "gemini_key_invalid", "false") or "false").lower() == "true"


@router.get("/me", response_model=UserResponse)
def get_me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
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
        has_gemini_key=bool(user.gemini_api_key),
        gemini_key_invalid=_gemini_key_invalid(db, user.id),
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
        has_gemini_key=bool(user.gemini_api_key),
        gemini_key_invalid=_gemini_key_invalid(db, user.id),
        onboarding_completed=user.onboarding_completed or False,
    )


# Wording used by the job runners when they stop a campaign for dead cookies,
# past and present. Only campaigns carrying one of these are auto-resumed —
# anything the user paused deliberately must stay paused.
_COOKIE_STOP_MARKERS = ("No valid LinkedIn cookies", "Cookies LinkedIn invalides")


def _resume_cookie_stopped_campaigns(db: Session, user: User) -> int:
    """Restart campaigns that a cookie outage stopped, now that it's over.

    Pasting a working session used to only flip a flag: every campaign the
    outage had stopped stayed down until the user reopened each one and hit
    resume, which is not obvious when nothing on screen says so.
    """
    from app.models import Campaign as _Campaign
    from app.scheduler import _campaigns, schedule_campaign_job, resume_campaign_job

    stopped = (
        db.query(_Campaign)
        .filter(_Campaign.user_id == user.id, _Campaign.status.in_(("paused", "failed")))
        .all()
    )
    resumed = 0
    for c in stopped:
        msg = c.error_message or ""
        if not any(marker in msg for marker in _COOKIE_STOP_MARKERS):
            continue
        c.status = "running"
        c.error_message = None
        resumed += 1
        try:
            if c.id not in _campaigns:
                schedule_campaign_job(c.id, c.type)
            else:
                resume_campaign_job(c.id)
        except Exception:
            logger.exception("Could not re-register campaign %s after cookie refresh", c.id)
    if resumed:
        db.commit()
    return resumed


@router.put("/cookies", response_model=CookiesStatus)
async def update_cookies(
    body: CookiesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update the user's LinkedIn session cookies and validate them."""
    # validate_cookies returns True / False / None (transient), and a dead
    # LinkedIn session shows up as transient — it answers with a redirect loop.
    # Saving optimistically on that told users their cookies were fine while
    # every campaign action kept failing. Retry a few times a moment apart: a
    # real glitch does not survive that, a dead session fails every time.
    result = None
    for attempt in range(3):
        result = await validate_cookies(body.li_at, body.jsessionid)
        if result is not None:
            break
        if attempt < 2:
            await asyncio.sleep(3)

    user.li_at_cookie = body.li_at
    user.jsessionid_cookie = body.jsessionid
    cookies_valid = bool(result)  # persistent transient -> invalid, and say so
    user.cookies_valid = cookies_valid
    db.commit()
    db.refresh(user)

    resumed = 0
    if cookies_valid:
        resumed = _resume_cookie_stopped_campaigns(db, user)

    if not cookies_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "LinkedIn refuse cette session (boucle de redirections). Les cookies "
                "ont été enregistrés mais marqués invalides. Reconnecte-toi à LinkedIn, "
                "recopie li_at et JSESSIONID, et évite de te déconnecter ensuite — "
                "LinkedIn révoque la session quand elle est utilisée depuis deux endroits."
            ),
        )

    return CookiesStatus(valid=cookies_valid)


@router.post("/validate-gemini-key")
def validate_gemini_key_endpoint(
    body: dict,
    _user: User = Depends(get_current_user),
):
    """Test a Gemini API key without storing it. Used by onboarding + Configuration
    to give immediate feedback before the user submits."""
    from app.utils.ai_message import validate_gemini_key
    key = (body.get("gemini_api_key") or "").strip()
    return validate_gemini_key(key)


@router.put("/gemini-key")
def update_gemini_key(
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update the user's Gemini API key. Validates against Google before saving,
    rejects with 400 if the key is malformed/unauthorized. Auto-pauses all running
    AI campaigns when a different key is set (since templates may have been tuned
    around the old key's behavior)."""
    from app.utils.ai_message import validate_gemini_key as _gemini_validate
    new_key = (body.get("gemini_api_key") or "").strip()

    if new_key:
        result = _gemini_validate(new_key)
        if not result["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Clé Gemini invalide. Vérifiez-la sur "
                    "https://aistudio.google.com/apikey et recollez-la."
                ),
            )
        # If key is valid but quota exceeded, store it but warn the caller.

    # Auto-pause running campaigns that use AI
    if user.gemini_api_key and new_key != user.gemini_api_key:
        running_ai = (
            db.query(Campaign)
            .filter(
                Campaign.user_id == user.id,
                Campaign.status == "running",
                Campaign.use_ai == True,
            )
            .all()
        )
        paused_count = 0
        for c in running_ai:
            c.status = "paused"
            pause_campaign_job(c.id)
            paused_count += 1
        if paused_count:
            db.commit()

    user.gemini_api_key = new_key if new_key else None
    # If the user provided a fresh valid key, clear the "invalid" flag so the
    # popup goes away. If they cleared the key (new_key is empty), keep it.
    if new_key:
        from app.utils.settings import set_setting
        set_setting(db, user.id, "gemini_key_invalid", "false")
    db.commit()

    return {"ok": True, "has_gemini_key": bool(user.gemini_api_key)}


@router.get("/cookies/status", response_model=CookiesStatus)
def cookies_status(user: User = Depends(get_current_user)):
    """Return whether the current user's cookies are valid."""
    return CookiesStatus(valid=user.cookies_valid or False)
