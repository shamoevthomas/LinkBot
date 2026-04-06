"""
CRON job to sync new LinkedIn connections into the "Mon Réseau" CRM.

Runs every 6 hours. Compares current connections with existing contacts
and adds any new ones.
"""

import asyncio
import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import CRM, Contact, User
from app.linkedin_service import get_linkedin_client, get_user_connections

logger = logging.getLogger(__name__)

_PAGE_SIZE = 49


async def sync_new_connections() -> None:
    """Check for new LinkedIn connections and add them to 'Mon Réseau' CRM."""
    print("[SYNC] Starting sync_new_connections", flush=True)
    db = SessionLocal()
    try:
        # Find the "Mon Réseau" CRM
        crm = db.query(CRM).filter(CRM.name == "Mon Réseau").first()
        if not crm:
            return  # No network CRM, nothing to sync

        # Get user with valid cookies
        user = db.query(User).first()
        if not user or not user.li_at_cookie or not user.cookies_valid:
            return

        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

        # Get user URN
        me = await asyncio.to_thread(client.get_user_profile, False)
        urn_id = _extract_urn(me)
        if not urn_id:
            logger.warning("sync_connections: could not determine user URN")
            return

        # Get existing URNs in the CRM for fast lookup
        existing_urns = set(
            row[0] for row in
            db.query(Contact.urn_id).filter(Contact.crm_id == crm.id).all()
        )

        offset = 0
        total_new = 0

        while True:
            try:
                connections = await get_user_connections(
                    client, urn_id=urn_id, limit=_PAGE_SIZE, offset=offset,
                )
            except Exception:
                logger.exception("sync_connections: error at offset %d", offset)
                break

            if not connections:
                break

            for person in connections:
                person_urn = person.get("urn_id")
                if not person_urn or person_urn in existing_urns:
                    continue

                name = person.get("name", "") or ""
                parts = name.split(" ", 1)
                first_name = parts[0] if parts else ""
                last_name = parts[1] if len(parts) > 1 else ""

                contact = Contact(
                    crm_id=crm.id,
                    urn_id=person_urn,
                    public_id=person.get("public_id"),
                    first_name=first_name,
                    last_name=last_name,
                    headline=person.get("jobtitle"),
                    location=person.get("location"),
                    profile_picture_url=person.get("picture_url"),
                    linkedin_url=person.get("navigation_url"),
                    connection_status="connected",
                )
                db.add(contact)
                existing_urns.add(person_urn)
                total_new += 1

            db.commit()
            offset += len(connections)

            if len(connections) < _PAGE_SIZE:
                break

        print(f"[SYNC] Done: added {total_new} new connections", flush=True)

    except Exception:
        logger.exception("sync_connections: unexpected error")
        db.rollback()
    finally:
        db.close()


def _extract_urn(profile_data: dict) -> str:
    if not isinstance(profile_data, dict):
        return ""
    for item in profile_data.get("included", []):
        dash_urn = item.get("dashEntityUrn", "")
        if "fsd_profile" in dash_urn:
            return dash_urn.split(":")[-1]
    plain_id = profile_data.get("data", {}).get("plainId")
    if plain_id:
        return str(plain_id)
    for item in profile_data.get("included", []):
        obj_urn = item.get("objectUrn", "")
        if obj_urn:
            return obj_urn.split(":")[-1]
    return ""
