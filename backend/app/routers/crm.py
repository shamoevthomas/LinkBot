"""
CRM routes: full CRUD for CRMs and their contacts.
"""

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models import User, CRM, Contact, Tag, ContactTag
from app.schemas import (
    CRMCreate,
    CRMUpdate,
    CRMResponse,
    ContactResponse,
    ContactAdd,
    BulkDelete,
    BulkMove,
    BulkUpdateStatus,
    BulkTagAssign,
    SendMessageRequest,
    GenerateAIMessageRequest,
    TagResponse,
)
from app.linkedin_service import get_linkedin_client, get_profile, send_message, search_people

router = APIRouter(prefix="/api/crms", tags=["crm"])


# ---------------------------------------------------------------------------
# Global contacts (must be before /{crm_id} routes)
# ---------------------------------------------------------------------------

@router.get("/all-contacts")
def list_all_contacts(
    search: Optional[str] = Query(None),
    connection_status: Optional[str] = Query(None),
    crm_id: Optional[int] = Query(None),
    sort_by: Optional[str] = Query("added_at"),
    sort_order: Optional[str] = Query("desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=10000),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all contacts across all CRMs with search, filter, sort, and pagination."""
    # Only show contacts from the current user's CRMs
    user_crm_ids = [c.id for c in db.query(CRM.id).filter(CRM.user_id == _user.id).all()]
    q = db.query(Contact).filter(Contact.crm_id.in_(user_crm_ids))

    if crm_id:
        q = q.filter(Contact.crm_id == crm_id)

    if search:
        pattern = f"%{search}%"
        q = q.filter(
            or_(
                Contact.first_name.ilike(pattern),
                Contact.last_name.ilike(pattern),
                Contact.headline.ilike(pattern),
                Contact.location.ilike(pattern),
            )
        )

    if connection_status:
        q = q.filter(Contact.connection_status == connection_status)

    total = q.count()

    sort_column = {
        "name": Contact.first_name,
        "added_at": Contact.added_at,
        "last_interaction_at": Contact.last_interaction_at,
    }.get(sort_by, Contact.added_at)

    if sort_order == "asc":
        q = q.order_by(sort_column.asc())
    else:
        q = q.order_by(sort_column.desc())

    offset = (page - 1) * per_page
    contacts = q.offset(offset).limit(per_page).all()

    # Build CRM name lookup
    crm_ids = list({c.crm_id for c in contacts})
    crm_map = {}
    if crm_ids:
        crm_rows = db.query(CRM.id, CRM.name).filter(CRM.id.in_(crm_ids)).all()
        crm_map = {r.id: r.name for r in crm_rows}

    return {
        "contacts": [
            {
                **ContactResponse(
                    id=c.id,
                    crm_id=c.crm_id,
                    urn_id=c.urn_id,
                    public_id=c.public_id,
                    first_name=c.first_name,
                    last_name=c.last_name,
                    headline=c.headline,
                    location=c.location,
                    profile_picture_url=c.profile_picture_url,
                    linkedin_url=c.linkedin_url,
                    connection_status=c.connection_status or "unknown",
                    last_interaction_at=c.last_interaction_at,
                    added_at=c.added_at,
                    tags=[TagResponse(id=t.id, name=t.name, color=t.color) for t in c.tags],
                ).model_dump(),
                "crm_name": crm_map.get(c.crm_id, "—"),
            }
            for c in contacts
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ---------------------------------------------------------------------------
# LinkedIn people search (must be before /{crm_id} routes)
# ---------------------------------------------------------------------------

@router.get("/search/people")
async def search_linkedin_people(
    q: str = Query(..., min_length=1, description="Search keywords (name, title, etc.)"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search LinkedIn for people by name/keywords. Returns up to 10 results."""
    if not user.li_at_cookie or not user.jsessionid_cookie or not user.cookies_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cookies LinkedIn invalides")

    client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)
    results = await search_people(client, keywords=q, limit=10)
    return {"results": results}


# ---------------------------------------------------------------------------
# CRM CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=list[CRMResponse])
def list_crms(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all CRMs with their contact counts."""
    crms = db.query(CRM).filter(CRM.user_id == _user.id).order_by(CRM.created_at.desc()).all()
    results = []
    for crm in crms:
        count = db.query(func.count(Contact.id)).filter(Contact.crm_id == crm.id).scalar() or 0
        results.append(
            CRMResponse(
                id=crm.id,
                name=crm.name,
                description=crm.description,
                contact_count=count,
                created_at=crm.created_at,
                updated_at=crm.updated_at,
            )
        )
    return results


@router.post("", response_model=CRMResponse, status_code=status.HTTP_201_CREATED)
def create_crm(
    body: CRMCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Create a new CRM."""
    existing = db.query(CRM).filter(CRM.name == body.name, CRM.user_id == _user.id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A CRM named '{body.name}' already exists.",
        )
    crm = CRM(name=body.name, description=body.description, user_id=_user.id)
    db.add(crm)
    db.commit()
    db.refresh(crm)
    return CRMResponse(
        id=crm.id,
        name=crm.name,
        description=crm.description,
        contact_count=0,
        created_at=crm.created_at,
        updated_at=crm.updated_at,
    )


@router.get("/{crm_id}", response_model=CRMResponse)
def get_crm(
    crm_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get a single CRM by ID."""
    crm = db.query(CRM).filter(CRM.id == crm_id, CRM.user_id == _user.id).first()
    if not crm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM not found")
    count = db.query(func.count(Contact.id)).filter(Contact.crm_id == crm.id).scalar() or 0
    return CRMResponse(
        id=crm.id,
        name=crm.name,
        description=crm.description,
        contact_count=count,
        created_at=crm.created_at,
        updated_at=crm.updated_at,
    )


@router.put("/{crm_id}", response_model=CRMResponse)
def update_crm(
    crm_id: int,
    body: CRMUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Update CRM name and/or description."""
    crm = db.query(CRM).filter(CRM.id == crm_id, CRM.user_id == _user.id).first()
    if not crm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM not found")

    if body.name is not None:
        # Check uniqueness per user
        dup = db.query(CRM).filter(CRM.name == body.name, CRM.user_id == _user.id, CRM.id != crm_id).first()
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A CRM named '{body.name}' already exists.",
            )
        crm.name = body.name
    if body.description is not None:
        crm.description = body.description

    db.commit()
    db.refresh(crm)
    count = db.query(func.count(Contact.id)).filter(Contact.crm_id == crm.id).scalar() or 0
    return CRMResponse(
        id=crm.id,
        name=crm.name,
        description=crm.description,
        contact_count=count,
        created_at=crm.created_at,
        updated_at=crm.updated_at,
    )


@router.delete("/{crm_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_crm(
    crm_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Delete a CRM and all its contacts (cascade)."""
    crm = db.query(CRM).filter(CRM.id == crm_id, CRM.user_id == _user.id).first()
    if not crm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM not found")
    db.delete(crm)
    db.commit()


# ---------------------------------------------------------------------------
# Contacts within a CRM
# ---------------------------------------------------------------------------

@router.get("/{crm_id}/contacts")
def list_contacts(
    crm_id: int,
    search: Optional[str] = Query(None, description="Search by name, headline, or location"),
    connection_status: Optional[str] = Query(None, description="Filter by connection_status"),
    headline_search: Optional[str] = Query(None),
    location_search: Optional[str] = Query(None),
    added_after: Optional[str] = Query(None),
    added_before: Optional[str] = Query(None),
    tag_id: Optional[int] = Query(None),
    sort_by: Optional[str] = Query("added_at", description="Sort field: name, added_at, last_interaction_at"),
    sort_order: Optional[str] = Query("desc", description="asc or desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=10000),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List contacts for a CRM with search, filter, sort, and pagination."""
    crm = db.query(CRM).filter(CRM.id == crm_id, CRM.user_id == _user.id).first()
    if not crm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM not found")

    q = db.query(Contact).filter(Contact.crm_id == crm_id)

    # Search filter
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            or_(
                Contact.first_name.ilike(pattern),
                Contact.last_name.ilike(pattern),
                Contact.headline.ilike(pattern),
                Contact.location.ilike(pattern),
            )
        )

    # Connection status filter
    if connection_status:
        q = q.filter(Contact.connection_status == connection_status)

    # Advanced filters
    if headline_search:
        q = q.filter(Contact.headline.ilike(f"%{headline_search}%"))
    if location_search:
        q = q.filter(Contact.location.ilike(f"%{location_search}%"))
    if added_after:
        q = q.filter(Contact.added_at >= datetime.fromisoformat(added_after))
    if added_before:
        q = q.filter(Contact.added_at <= datetime.fromisoformat(added_before + "T23:59:59"))
    if tag_id:
        q = q.join(ContactTag, Contact.id == ContactTag.contact_id).filter(ContactTag.tag_id == tag_id)

    total = q.count()

    # Sorting
    sort_column = {
        "name": Contact.first_name,
        "added_at": Contact.added_at,
        "last_interaction_at": Contact.last_interaction_at,
    }.get(sort_by, Contact.added_at)

    if sort_order == "asc":
        q = q.order_by(sort_column.asc())
    else:
        q = q.order_by(sort_column.desc())

    # Pagination
    offset = (page - 1) * per_page
    contacts = q.offset(offset).limit(per_page).all()

    return {
        "contacts": [
            ContactResponse(
                id=c.id,
                crm_id=c.crm_id,
                urn_id=c.urn_id,
                public_id=c.public_id,
                first_name=c.first_name,
                last_name=c.last_name,
                headline=c.headline,
                location=c.location,
                profile_picture_url=c.profile_picture_url,
                linkedin_url=c.linkedin_url,
                connection_status=c.connection_status or "unknown",
                last_interaction_at=c.last_interaction_at,
                added_at=c.added_at,
                tags=[TagResponse(id=t.id, name=t.name, color=t.color) for t in c.tags],
            )
            for c in contacts
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("/{crm_id}/contacts", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def add_contact(
    crm_id: int,
    body: ContactAdd,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a contact to a CRM by urn_id or linkedin_url.

    If the user has valid cookies, the contact's profile will be enriched
    from LinkedIn automatically.
    """
    crm = db.query(CRM).filter(CRM.id == crm_id, CRM.user_id == user.id).first()
    if not crm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM not found")

    urn_id = body.urn_id
    public_id: Optional[str] = None

    # Try to extract public_id / urn_id from linkedin_url
    if not urn_id and body.linkedin_url:
        url = body.linkedin_url.rstrip("/")
        if "/in/" in url:
            public_id = url.split("/in/")[-1].split("?")[0]
        if not public_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot extract profile identifier from the provided URL.",
            )

    if not urn_id and not public_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either urn_id or linkedin_url.",
        )

    # Enrich from LinkedIn if cookies are available
    profile_data: dict = {}
    if user.li_at_cookie and user.jsessionid_cookie and user.cookies_valid:
        try:
            client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)
            if urn_id:
                profile_data = await get_profile(client, urn_id=urn_id)
            elif public_id:
                profile_data = await get_profile(client, public_id=public_id)
        except Exception:
            pass  # proceed without enrichment

    if profile_data:
        urn_id = urn_id or profile_data.get("urn_id") or profile_data.get("profile_id", "")
        public_id = public_id or profile_data.get("public_id")

    if not urn_id:
        urn_id = public_id or ""

    if not urn_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not resolve a valid identifier for this contact.",
        )

    # Check for duplicate
    existing = db.query(Contact).filter(
        Contact.crm_id == crm_id, Contact.urn_id == urn_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contact already exists in this CRM.",
        )

    # Build full profile picture URL from root + best artifact
    pic_url = None
    if profile_data:
        root = profile_data.get("displayPictureUrl", "")
        # Find best resolution artifact (400x400)
        best_seg = profile_data.get("img_400_400") or profile_data.get("img_200_200") or profile_data.get("img_100_100")
        if root and best_seg:
            pic_url = root + best_seg
        elif root:
            pic_url = root

    contact = Contact(
        crm_id=crm_id,
        urn_id=urn_id,
        public_id=public_id or profile_data.get("public_id"),
        first_name=profile_data.get("firstName") or profile_data.get("first_name"),
        last_name=profile_data.get("lastName") or profile_data.get("last_name"),
        headline=profile_data.get("headline"),
        location=profile_data.get("locationName") or profile_data.get("geoLocationName") or profile_data.get("location"),
        profile_picture_url=pic_url,
        linkedin_url=(
            body.linkedin_url
            or (f"https://www.linkedin.com/in/{public_id}" if public_id else None)
        ),
        connection_status="unknown",
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)

    return ContactResponse(
        id=contact.id,
        crm_id=contact.crm_id,
        urn_id=contact.urn_id,
        public_id=contact.public_id,
        first_name=contact.first_name,
        last_name=contact.last_name,
        headline=contact.headline,
        location=contact.location,
        profile_picture_url=contact.profile_picture_url,
        linkedin_url=contact.linkedin_url,
        connection_status=contact.connection_status or "unknown",
        last_interaction_at=contact.last_interaction_at,
        added_at=contact.added_at,
    )


@router.post("/{crm_id}/contacts/{contact_id}/message")
async def send_dm_to_contact(
    crm_id: int,
    contact_id: int,
    body: SendMessageRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a direct message to a contact via LinkedIn."""
    contact = db.query(Contact).filter(
        Contact.id == contact_id, Contact.crm_id == crm_id
    ).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    if not user.li_at_cookie or not user.jsessionid_cookie or not user.cookies_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cookies LinkedIn invalides")

    client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)
    success = await send_message(client, contact.urn_id, body.message)

    if success:
        from datetime import datetime
        contact.last_interaction_at = datetime.utcnow()
        db.commit()
        return {"status": "sent"}
    else:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Échec de l'envoi du message")


@router.post("/{crm_id}/contacts/{contact_id}/generate-message")
async def generate_ai_message(
    crm_id: int,
    contact_id: int,
    body: GenerateAIMessageRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a personalized AI message for a contact using rich profile data."""
    import asyncio
    from app.utils.ai_message import generate_personalized_message, is_ollama_available, extract_post_texts
    from app.linkedin_service import get_linkedin_client, get_profile, get_profile_posts

    contact = db.query(Contact).filter(
        Contact.id == contact_id, Contact.crm_id == crm_id
    ).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    if not is_ollama_available():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="L'IA n'est pas disponible")

    contact_data = {
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "headline": contact.headline,
        "location": contact.location,
    }

    # Fetch rich profile data + recent posts for better personalization
    profile_data = None
    recent_posts = None
    if user.li_at_cookie and user.cookies_valid:
        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)
        try:
            profile_data = await get_profile(client, urn_id=contact.urn_id)
        except Exception:
            pass
        try:
            raw_posts = await get_profile_posts(client, urn_id=contact.urn_id, post_count=3)
            recent_posts = extract_post_texts(raw_posts) if raw_posts else None
        except Exception:
            pass

    message = await asyncio.to_thread(
        generate_personalized_message,
        body.instructions,
        contact_data,
        2000,
        profile_data,
        recent_posts,
    )
    if not message:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="L'IA n'a pas pu generer de message")

    return {"message": message}


@router.delete("/{crm_id}/contacts", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete_contacts(
    crm_id: int,
    body: BulkDelete,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Bulk-delete contacts from a CRM."""
    crm = db.query(CRM).filter(CRM.id == crm_id, CRM.user_id == _user.id).first()
    if not crm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM not found")

    db.query(Contact).filter(
        Contact.crm_id == crm_id,
        Contact.id.in_(body.contact_ids),
    ).delete(synchronize_session="fetch")
    db.commit()


@router.post("/{crm_id}/contacts/move", status_code=status.HTTP_200_OK)
def bulk_move_contacts(
    crm_id: int,
    body: BulkMove,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Move contacts from one CRM to another."""
    source = db.query(CRM).filter(CRM.id == crm_id, CRM.user_id == _user.id).first()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source CRM not found")

    target = db.query(CRM).filter(CRM.id == body.target_crm_id, CRM.user_id == _user.id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target CRM not found")

    contacts = (
        db.query(Contact)
        .filter(Contact.crm_id == crm_id, Contact.id.in_(body.contact_ids))
        .all()
    )

    moved = 0
    skipped = 0
    for contact in contacts:
        # Check for duplicate in target CRM
        dup = db.query(Contact).filter(
            Contact.crm_id == body.target_crm_id,
            Contact.urn_id == contact.urn_id,
        ).first()
        if dup:
            skipped += 1
            continue
        contact.crm_id = body.target_crm_id
        moved += 1

    db.commit()
    return {"moved": moved, "skipped": skipped}


@router.patch("/{crm_id}/contacts/status", status_code=status.HTTP_200_OK)
def bulk_update_status(
    crm_id: int,
    body: BulkUpdateStatus,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Bulk-update the connection_status for selected contacts."""
    VALID_STATUSES = {"unknown", "not_connected", "request_sent", "connected"}
    if body.connection_status not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}",
        )

    updated = (
        db.query(Contact)
        .filter(Contact.crm_id == crm_id, Contact.id.in_(body.contact_ids))
        .update({Contact.connection_status: body.connection_status}, synchronize_session="fetch")
    )
    db.commit()
    return {"updated": updated}


@router.get("/{crm_id}/contacts/export")
def export_contacts_csv(
    crm_id: int,
    search: Optional[str] = Query(None),
    connection_status: Optional[str] = Query(None),
    headline_search: Optional[str] = Query(None),
    location_search: Optional[str] = Query(None),
    added_after: Optional[str] = Query(None),
    added_before: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Export contacts as CSV with the same filters as list_contacts."""
    crm = db.query(CRM).filter(CRM.id == crm_id, CRM.user_id == _user.id).first()
    if not crm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CRM not found")

    q = db.query(Contact).filter(Contact.crm_id == crm_id)

    if search:
        pattern = f"%{search}%"
        q = q.filter(
            or_(
                Contact.first_name.ilike(pattern),
                Contact.last_name.ilike(pattern),
                Contact.headline.ilike(pattern),
                Contact.location.ilike(pattern),
            )
        )
    if connection_status:
        q = q.filter(Contact.connection_status == connection_status)
    if headline_search:
        q = q.filter(Contact.headline.ilike(f"%{headline_search}%"))
    if location_search:
        q = q.filter(Contact.location.ilike(f"%{location_search}%"))
    if added_after:
        q = q.filter(Contact.added_at >= datetime.fromisoformat(added_after))
    if added_before:
        q = q.filter(Contact.added_at <= datetime.fromisoformat(added_before + "T23:59:59"))

    contacts = q.order_by(Contact.added_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["first_name", "last_name", "headline", "location", "linkedin_url", "connection_status", "added_at"])
    for c in contacts:
        writer.writerow([
            c.first_name or "",
            c.last_name or "",
            c.headline or "",
            c.location or "",
            c.linkedin_url or "",
            c.connection_status or "",
            c.added_at.isoformat() if c.added_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=contacts_crm_{crm_id}.csv"},
    )


@router.post("/{crm_id}/contacts/tag", status_code=status.HTTP_200_OK)
def bulk_assign_tag(crm_id: int, body: BulkTagAssign, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    """Assign a tag to selected contacts."""
    tag = db.query(Tag).filter(Tag.id == body.tag_id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    added = 0
    for cid in body.contact_ids:
        existing = db.query(ContactTag).filter(ContactTag.contact_id == cid, ContactTag.tag_id == body.tag_id).first()
        if not existing:
            db.add(ContactTag(contact_id=cid, tag_id=body.tag_id))
            added += 1
    db.commit()
    return {"added": added}


@router.delete("/{crm_id}/contacts/tag", status_code=status.HTTP_200_OK)
def bulk_remove_tag(crm_id: int, body: BulkTagAssign, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    """Remove a tag from selected contacts."""
    db.query(ContactTag).filter(ContactTag.contact_id.in_(body.contact_ids), ContactTag.tag_id == body.tag_id).delete(synchronize_session="fetch")
    db.commit()
    return {"removed": len(body.contact_ids)}
