"""
CRON job to sync new LinkedIn connections into the "Mon Réseau" CRM.

Runs every 6 hours. Compares current connections with existing contacts
and adds any new ones.
"""

import asyncio
import logging

from app.database import SessionLocal
from app.models import CRM, Contact, User
from app.linkedin_service import get_linkedin_client

logger = logging.getLogger(__name__)


async def sync_new_connections() -> None:
    """Check for new LinkedIn connections for ALL users with valid cookies."""
    print("[SYNC] Starting sync_new_connections for all users", flush=True)
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.cookies_valid == True, User.li_at_cookie.isnot(None)).all()
        for user in users:
            await _sync_user_connections(user.id, user.li_at_cookie, user.jsessionid_cookie)
    finally:
        db.close()


async def _sync_user_connections(user_id: int, li_at: str, jsessionid: str) -> None:
    """Sync connections for a single user using dedicated connections endpoint."""
    db = SessionLocal()
    try:
        crm = db.query(CRM).filter(CRM.name == "Mon Réseau", CRM.user_id == user_id).first()
        if not crm:
            return

        client = get_linkedin_client(li_at, jsessionid)

        existing_urns = set(
            row[0] for row in
            db.query(Contact.urn_id).filter(Contact.crm_id == crm.id).all()
        )

        # Use dedicated connections endpoint instead of search API
        try:
            all_connections = await asyncio.to_thread(client.get_all_connections)
        except Exception:
            logger.exception("sync_connections: error fetching connections for user %d", user_id)
            return

        total_new = 0
        for person in all_connections:
            person_urn = person.get("urn_id")
            if not person_urn or person_urn in existing_urns:
                continue

            contact = Contact(
                crm_id=crm.id,
                urn_id=person_urn,
                public_id=person.get("public_id"),
                first_name=person.get("first_name", ""),
                last_name=person.get("last_name", ""),
                headline=person.get("jobtitle"),
                location=person.get("location"),
                profile_picture_url=person.get("picture_url"),
                linkedin_url=person.get("navigation_url"),
                connection_status="connected",
            )
            db.add(contact)
            existing_urns.add(person_urn)
            total_new += 1

        try:
            db.commit()
        except Exception:
            db.rollback()

        print(f"[SYNC] User {user_id}: added {total_new} new connections", flush=True)

    except Exception:
        logger.exception("sync_connections: unexpected error for user %d", user_id)
        db.rollback()
    finally:
        db.close()


async def sync_and_update_statuses(li_at: str, jsessionid: str, user_id: int = None) -> None:
    """Manual sync: import new connections to user's 'Mon Réseau' + update statuses across user's CRMs."""
    print(f"[SYNC] Manual sync_and_update_statuses started for user {user_id}", flush=True)
    db = SessionLocal()
    try:
        client = get_linkedin_client(li_at, jsessionid)

        # Step 1: Fetch all connections using dedicated connections endpoint
        try:
            all_connections = await asyncio.to_thread(client.get_all_connections)
        except Exception:
            logger.exception("sync_and_update: error fetching connections")
            all_connections = []

        all_connection_urns = set()
        for person in all_connections:
            person_urn = person.get("urn_id")
            if person_urn:
                all_connection_urns.add(person_urn)

        print(f"[SYNC] Fetched {len(all_connection_urns)} total connections from LinkedIn", flush=True)

        # Step 3: Add new connections to user's "Mon Réseau" CRM
        crm_filter = [CRM.name == "Mon Réseau"]
        if user_id:
            crm_filter.append(CRM.user_id == user_id)
        crm = db.query(CRM).filter(*crm_filter).first()
        total_new = 0
        if crm:
            existing_urns = set(
                row[0] for row in
                db.query(Contact.urn_id).filter(Contact.crm_id == crm.id).all()
            )
            for person in all_connections:
                person_urn = person.get("urn_id")
                if not person_urn or person_urn in existing_urns:
                    continue

                contact = Contact(
                    crm_id=crm.id,
                    urn_id=person_urn,
                    public_id=person.get("public_id"),
                    first_name=person.get("first_name", ""),
                    last_name=person.get("last_name", ""),
                    headline=person.get("jobtitle"),
                    location=person.get("location"),
                    profile_picture_url=person.get("picture_url"),
                    linkedin_url=person.get("navigation_url"),
                    connection_status="connected",
                )
                db.add(contact)
                existing_urns.add(person_urn)
                total_new += 1

            try:
                db.commit()
            except Exception:
                db.rollback()

        # Step 4: Update connection_status across user's CRMs only
        updated = 0
        if all_connection_urns:
            user_crm_ids = [c.id for c in db.query(CRM.id).filter(CRM.user_id == user_id).all()] if user_id else []
            contact_filter = [
                Contact.urn_id.in_(all_connection_urns),
                Contact.connection_status != "connected",
            ]
            if user_crm_ids:
                contact_filter.append(Contact.crm_id.in_(user_crm_ids))
            contacts_to_update = db.query(Contact).filter(*contact_filter).all()
            for contact in contacts_to_update:
                contact.connection_status = "connected"
                updated += 1
            db.commit()

        print(f"[SYNC] Manual sync done for user {user_id}: {total_new} new in Mon Réseau, {updated} statuses updated", flush=True)

    except Exception:
        logger.exception("sync_and_update: unexpected error")
        db.rollback()
    finally:
        db.close()
