"""Blacklist / Do Not Contact management."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.dependencies import get_db, get_current_user
from app.models import User, Blacklist
from app.schemas import BlacklistCreate, BlacklistResponse

router = APIRouter(prefix="/api/blacklist", tags=["blacklist"])

@router.get("", response_model=list[BlacklistResponse])
def list_blacklist(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    q = db.query(Blacklist).filter(Blacklist.user_id == _user.id)
    if search:
        q = q.filter(Blacklist.name.ilike(f"%{search}%"))
    offset = (page - 1) * page_size
    return q.order_by(Blacklist.created_at.desc()).offset(offset).limit(page_size).all()

@router.post("", response_model=BlacklistResponse, status_code=status.HTTP_201_CREATED)
def add_to_blacklist(body: BlacklistCreate, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    existing = db.query(Blacklist).filter(Blacklist.urn_id == body.urn_id, Blacklist.user_id == _user.id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already blacklisted")
    entry = Blacklist(urn_id=body.urn_id, public_id=body.public_id, name=body.name, reason=body.reason, user_id=_user.id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

@router.delete("/{blacklist_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_from_blacklist(blacklist_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    entry = db.query(Blacklist).filter(Blacklist.id == blacklist_id, Blacklist.user_id == _user.id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    db.delete(entry)
    db.commit()
