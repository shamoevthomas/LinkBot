import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import CORS_ORIGINS, UPLOADS_DIR
from app.database import init_db, SessionLocal
from app.models import User, AppSettings, CRM
from app.auth import hash_password

# Configure root logger so all app.* loggers output to stdout
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    stream=sys.stdout,
    force=True,
)
# Quiet down noisy libraries
logging.getLogger("urllib3").setLevel(logging.WARNING)


def seed_db():
    db = SessionLocal()
    try:
        # Create default user if not exists
        user = db.query(User).filter(User.username == "TEKA").first()
        if not user:
            user = User(
                id=1,
                username="TEKA",
                email="admin@linkbot.local",
                password_hash=hash_password("ADMIN"),
            )
            db.add(user)

        # Seed default settings
        defaults = {
            "max_connections_per_day": "25",
            "max_dms_per_day": "50",
            "default_spread_days": "5",
            "schedule_enabled": "false",
            "warmup_enabled": "false",
            "warmup_start_limit": "5",
            "warmup_target_limit": "25",
            "warmup_days": "7",
            "warmup_started_at": "",
            "action_interval_min": "2",
            "action_interval_max": "5",
        }
        for key, value in defaults.items():
            existing = db.query(AppSettings).filter(AppSettings.key == key).first()
            if not existing:
                db.add(AppSettings(key=key, value=value))

        # Ensure "Mon Réseau" CRM exists for TEKA user
        if not db.query(CRM).filter(CRM.name == "Mon Réseau", CRM.user_id == user.id).first():
            db.add(CRM(name="Mon Réseau", description="Toutes vos connexions LinkedIn", user_id=user.id))

        db.commit()
    finally:
        db.close()


def _recover_running_campaigns():
    """Re-register scheduler jobs for campaigns that are still 'running'."""
    from app.models import Campaign
    from app.scheduler import schedule_campaign_job

    db = SessionLocal()
    try:
        running = db.query(Campaign).filter(Campaign.status == "running").all()
        for c in running:
            schedule_campaign_job(c.id, c.type)
            print(f"[STARTUP] Recovered campaign {c.id} ({c.type})", flush=True)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    seed_db()
    from app.scheduler import init_scheduler, shutdown_scheduler
    await init_scheduler()
    _recover_running_campaigns()
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
from app.routers import notifications as notifications_router

app.include_router(auth_router.router)
app.include_router(user_router.router)
app.include_router(onboarding_router.router)
app.include_router(crm_router.router)
app.include_router(campaigns_router.router)
app.include_router(config_router.router)
app.include_router(dashboard_router.router)
app.include_router(blacklist_router.router)
app.include_router(tags_router.router)
app.include_router(notifications_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "LinkBot"}


@app.get("/api/ai/status")
def ai_status():
    from app.utils.ai_message import is_ollama_available
    return {"available": is_ollama_available()}


@app.get("/api/cron/sync-connections")
async def cron_sync_connections(key: str = ""):
    """Endpoint for external cron (cron-job.org) to trigger connection sync for ALL users."""
    from app.config import CRON_SECRET
    if key != CRON_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Invalid key")

    from app.database import SessionLocal
    from app.models import User

    db = SessionLocal()
    try:
        users = db.query(User).filter(User.cookies_valid == True, User.li_at_cookie.isnot(None)).all()
        if not users:
            return {"status": "skipped", "reason": "No users with valid cookies"}
    finally:
        db.close()

    from app.jobs.sync_connections import sync_and_update_statuses
    import asyncio
    for user in users:
        asyncio.create_task(sync_and_update_statuses(
            li_at=user.li_at_cookie,
            jsessionid=user.jsessionid_cookie,
            user_id=user.id,
        ))
    return {"status": "started", "users": len(users)}
