"""Dashboard stats and notifications."""
import logging
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.dependencies import get_db, get_current_user
from app.models import User, CRM, Contact, Campaign, CampaignAction, CampaignContact, AppSettings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    total_contacts = db.query(func.count(Contact.id)).scalar() or 0
    total_crms = db.query(func.count(CRM.id)).scalar() or 0
    active_campaigns = db.query(func.count(Campaign.id)).filter(Campaign.status == "running").scalar() or 0

    today = date.today()
    actions_today = db.query(func.count(CampaignAction.id)).filter(
        func.date(CampaignAction.created_at) == today
    ).scalar() or 0

    # Remaining quotas
    max_conn_row = db.query(AppSettings).filter(AppSettings.key == "max_connections_per_day").first()
    max_dm_row = db.query(AppSettings).filter(AppSettings.key == "max_dms_per_day").first()
    max_conn = int(max_conn_row.value) if max_conn_row else 25
    max_dm = int(max_dm_row.value) if max_dm_row else 50

    conn_today = db.query(func.count(CampaignAction.id)).filter(
        func.date(CampaignAction.created_at) == today,
        CampaignAction.action_type.in_(["connection_request", "connection_send"]),
        CampaignAction.status == "success",
    ).scalar() or 0

    dm_today = db.query(func.count(CampaignAction.id)).filter(
        func.date(CampaignAction.created_at) == today,
        CampaignAction.action_type.in_(["dm_send", "dm_followup"]),
        CampaignAction.status == "success",
    ).scalar() or 0

    # --- global reply rate (dm + connection_dm campaigns) ---
    dm_campaign_ids = [c.id for c in db.query(Campaign.id).filter(Campaign.type.in_(["dm", "connection_dm"])).all()]
    global_reply_rate = 0.0
    if dm_campaign_ids:
        total_messaged = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(dm_campaign_ids),
            CampaignContact.status.notin_(["pending", "en_attente"]),
        ).scalar() or 0
        total_replied = db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(dm_campaign_ids),
            CampaignContact.status == "reussi",
        ).scalar() or 0
        global_reply_rate = round(total_replied / total_messaged * 100, 1) if total_messaged > 0 else 0.0

    # --- global connection rate (connection + connection_dm campaigns) ---
    global_connection_rate = 0.0
    conn_dm_ids = [c.id for c in db.query(Campaign.id).filter(Campaign.type == "connection_dm").all()]
    conn_only_campaigns = db.query(Campaign).filter(Campaign.type == "connection").all()

    total_conn_requests = 0
    total_conn_accepted = 0
    # From connection_dm: tracked via CampaignContact
    if conn_dm_ids:
        total_conn_requests += db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(conn_dm_ids),
            CampaignContact.status != "pending",
        ).scalar() or 0
        total_conn_accepted += db.query(func.count(CampaignContact.id)).filter(
            CampaignContact.campaign_id.in_(conn_dm_ids),
            CampaignContact.status.notin_(["pending", "en_attente"]),
        ).scalar() or 0
    # From plain connection campaigns: use succeeded / (succeeded + failed)
    for cc in conn_only_campaigns:
        sent = (cc.total_succeeded or 0) + (cc.total_failed or 0)
        total_conn_requests += sent
        total_conn_accepted += cc.total_succeeded or 0
    if total_conn_requests > 0:
        global_connection_rate = round(total_conn_accepted / total_conn_requests * 100, 1)

    recent_campaigns = db.query(Campaign).order_by(Campaign.created_at.desc()).limit(3).all()

    recent_actions_q = (
        db.query(CampaignAction, Contact)
        .outerjoin(Contact, CampaignAction.contact_id == Contact.id)
        .order_by(CampaignAction.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "total_contacts": total_contacts,
        "total_crms": total_crms,
        "active_campaigns": active_campaigns,
        "actions_today": actions_today,
        "remaining_connections": max(0, max_conn - conn_today),
        "remaining_dms": max(0, max_dm - dm_today),
        "global_reply_rate": global_reply_rate,
        "global_connection_rate": global_connection_rate,
        "recent_campaigns": [
            {"id": c.id, "name": c.name, "type": c.type, "status": c.status, "created_at": c.created_at.isoformat() if c.created_at else None}
            for c in recent_campaigns
        ],
        "recent_actions": [
            {
                "id": a.id,
                "action_type": a.action_type,
                "status": a.status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "contact_name": f"{c.first_name or ''} {c.last_name or ''}".strip() if c else None,
            }
            for a, c in recent_actions_q
        ],
    }

@router.get("/notifications")
def get_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cutoff = datetime.utcnow() - timedelta(hours=24)
    campaigns_attention = db.query(func.count(Campaign.id)).filter(
        Campaign.status.in_(["completed", "failed"]),
        Campaign.completed_at >= cutoff,
    ).scalar() or 0
    return {
        "campaigns_attention": campaigns_attention,
        "cookies_invalid": not user.cookies_valid,
    }
