"""In-app notification system."""
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models import User, Notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def create_notification(db: Session, user_id: int, type: str, title: str, message: str = ""):
    """Helper to create a notification from anywhere in the app."""
    db.add(Notification(user_id=user_id, type=type, title=title, message=message))
    db.commit()


@router.get("")
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List recent notifications for the current user."""
    notifs = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread_count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.read == False)
        .count()
    )
    return {
        "notifications": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "read": n.read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifs
        ],
        "unread_count": unread_count,
    }


@router.patch("/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Mark a single notification as read."""
    notif = db.query(Notification).filter(
        Notification.id == notification_id, Notification.user_id == user.id
    ).first()
    if notif:
        notif.read = True
        db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Mark all notifications as read."""
    db.query(Notification).filter(
        Notification.user_id == user.id, Notification.read == False
    ).update({"read": True}, synchronize_session="fetch")
    db.commit()
    return {"ok": True}
