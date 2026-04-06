from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import CORS_ORIGINS, UPLOADS_DIR
from app.database import init_db, SessionLocal
from app.models import User, AppSettings, CRM
from app.auth import hash_password


def seed_db():
    db = SessionLocal()
    try:
        # Create default user if not exists
        user = db.query(User).filter(User.username == "TEKA").first()
        if not user:
            user = User(
                id=1,
                username="TEKA",
                password_hash=hash_password("ADMIN"),
            )
            db.add(user)

        # Seed default settings
        defaults = {
            "max_connections_per_day": "25",
            "max_dms_per_day": "50",
            "default_spread_days": "5",
            "warmup_enabled": "false",
            "warmup_start_limit": "5",
            "warmup_target_limit": "25",
            "warmup_days": "7",
            "warmup_started_at": "",
        }
        for key, value in defaults.items():
            existing = db.query(AppSettings).filter(AppSettings.key == key).first()
            if not existing:
                db.add(AppSettings(key=key, value=value))

        # Ensure "Mon Réseau" CRM always exists
        if not db.query(CRM).filter(CRM.name == "Mon Réseau").first():
            db.add(CRM(name="Mon Réseau", description="Toutes vos connexions LinkedIn"))

        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    seed_db()
    from app.scheduler import init_scheduler, shutdown_scheduler
    init_scheduler()
    yield
    # Shutdown
    shutdown_scheduler()


app = FastAPI(title="LinkBot", version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Register routers
from app.routers import auth as auth_router
from app.routers import user as user_router
from app.routers import onboarding as onboarding_router
from app.routers import crm as crm_router
from app.routers import campaigns as campaigns_router
from app.routers import config as config_router
from app.routers import dashboard as dashboard_router
from app.routers import blacklist as blacklist_router
from app.routers import tags as tags_router

app.include_router(auth_router.router)
app.include_router(user_router.router)
app.include_router(onboarding_router.router)
app.include_router(crm_router.router)
app.include_router(campaigns_router.router)
app.include_router(config_router.router)
app.include_router(dashboard_router.router)
app.include_router(blacklist_router.router)
app.include_router(tags_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "LinkBot"}


@app.get("/api/ai/status")
def ai_status():
    from app.utils.ai_message import is_ollama_available
    return {"available": is_ollama_available()}
