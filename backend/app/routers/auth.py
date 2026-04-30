from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.dependencies import get_db
from app.models import User
from app.auth import hash_password, verify_password, create_token
from app.schemas import LoginRequest, RegisterRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit faire au moins 6 caractères")

    # Auto-generate username from email prefix
    base_username = req.email.split("@")[0]
    username = base_username
    counter = 1
    while db.query(User).filter(User.username == username).first():
        username = f"{base_username}{counter}"
        counter += 1

    user = User(
        username=username,
        email=req.email,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user.id)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # Admin bypass: TEKA / ADMIN — get-or-create the TEKA user and issue a token.
    if req.email == "TEKA" and req.password == "ADMIN":
        user = db.query(User).filter(User.username == "TEKA").first()
        if not user:
            user = User(
                username="TEKA",
                email="teka@admin.local",
                password_hash=hash_password("ADMIN"),
                onboarding_completed=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        return TokenResponse(access_token=create_token(user.id))

    # Try email first, then fallback to username (for legacy TEKA login)
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        user = db.query(User).filter(User.username == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects",
        )
    token = create_token(user.id)
    return TokenResponse(access_token=token)
