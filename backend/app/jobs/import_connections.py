"""
Background job to import all of the current user's LinkedIn connections
into a specified CRM, with progress tracking via the ImportJob model.
"""

import asyncio
import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import Contact, ImportJob
from app.linkedin_service import get_linkedin_client, get_user_connections

logger = logging.getLogger(__name__)

_PAGE_SIZE = 49


def run_import_connections(crm_id: int, li_at: str, jsessionid: str, import_job_id: int) -> None:
    """Synchronous entry point for BackgroundTasks."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_async_import(crm_id, li_at, jsessionid, import_job_id))
    finally:
        loop.close()


async def _async_import(crm_id: int, li_at: str, jsessionid: str, import_job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
        client = get_linkedin_client(li_at, jsessionid)

        # Get user URN from profile
        me = await asyncio.to_thread(client.get_user_profile, False)
        urn_id = _extract_urn(me)

        if not urn_id:
            logger.error("Could not determine current user URN for import")
            if job:
                job.status = "failed"
                job.error_message = "Could not determine your LinkedIn URN"
                job.completed_at = datetime.utcnow()
                db.commit()
            return

        import json

        offset = 0
        total_created = 0
        total_skipped = 0
        skipped_list = []  # [{name, reason}]

        while True:
            try:
                connections = await get_user_connections(
                    client, urn_id=urn_id, limit=_PAGE_SIZE, offset=offset,
                )
            except Exception:
                logger.exception("Error fetching connections at offset %d", offset)
                break

            if not connections:
                break

            for person in connections:
                person_urn = person.get("urn_id")
                person_name = person.get("name", "") or "Inconnu"

                if not person_urn:
                    total_skipped += 1
                    skipped_list.append({"name": person_name, "reason": "Pas d'identifiant LinkedIn (urn_id)"})
                    continue

                existing = db.query(Contact).filter(
                    Contact.crm_id == crm_id, Contact.urn_id == person_urn,
                ).first()
                if existing:
                    total_skipped += 1
                    skipped_list.append({"name": person_name, "reason": "Déjà présent dans ce CRM"})
                    continue

                parts = person_name.split(" ", 1)
                first_name = parts[0] if parts else ""
                last_name = parts[1] if len(parts) > 1 else ""

                contact = Contact(
                    crm_id=crm_id,
                    urn_id=person_urn,
                    first_name=first_name,
                    last_name=last_name,
                    headline=person.get("jobtitle"),
                    location=person.get("location"),
                    linkedin_url=person.get("navigation_url"),
                    connection_status="connected",
                )
                db.add(contact)
                total_created += 1

            db.commit()
            offset += len(connections)

            # Update progress in real time
            if job:
                job.total_found = offset
                job.total_created = total_created
                job.total_skipped = total_skipped
                job.skipped_details = json.dumps(skipped_list, ensure_ascii=False) if skipped_list else None
                db.commit()

            if len(connections) < _PAGE_SIZE:
                break

        # Mark as completed
        if job:
            job.status = "completed"
            job.total_found = offset
            job.total_created = total_created
            job.total_skipped = total_skipped
            job.skipped_details = json.dumps(skipped_list, ensure_ascii=False) if skipped_list else None
            job.completed_at = datetime.utcnow()
            db.commit()

        logger.info(
            "Import connections into CRM %d complete: %d created, %d skipped",
            crm_id, total_created, total_skipped,
        )

    except Exception:
        logger.exception("Import connections job failed for CRM %d", crm_id)
        db.rollback()
        try:
            job = db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
            if job:
                job.status = "failed"
                job.error_message = "Unexpected error during import"
                job.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _extract_urn(profile_data: dict) -> str:
    """Extract the user's URN ID from the get_user_profile response.

    The Voyager API returns the profile in `included[]` with a
    `dashEntityUrn` like `urn:li:fsd_profile:ACoAA...`.
    """
    if not isinstance(profile_data, dict):
        return ""

    # Try included[] array (Voyager format)
    for item in profile_data.get("included", []):
        dash_urn = item.get("dashEntityUrn", "")
        if "fsd_profile" in dash_urn:
            return dash_urn.split(":")[-1]

    # Try data.plainId as fallback
    plain_id = profile_data.get("data", {}).get("plainId")
    if plain_id:
        return str(plain_id)

    # Try objectUrn in included
    for item in profile_data.get("included", []):
        obj_urn = item.get("objectUrn", "")
        if obj_urn:
            return obj_urn.split(":")[-1]

    return ""
