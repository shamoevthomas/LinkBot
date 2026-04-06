"""Tag management for contacts."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.dependencies import get_db, get_current_user
from app.models import User, Tag, ContactTag, Contact
from app.schemas import TagCreate, TagResponse, BulkTagAssign

router = APIRouter(prefix="/api/tags", tags=["tags"])

@router.get("", response_model=list[TagResponse])
def list_tags(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return db.query(Tag).order_by(Tag.name).all()

@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(body: TagCreate, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    existing = db.query(Tag).filter(Tag.name == body.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag already exists")
    tag = Tag(name=body.name, color=body.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag

@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: int, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    db.delete(tag)
    db.commit()
