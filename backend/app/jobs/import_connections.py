"""
Background job to import all of the current user's LinkedIn connections
into a specified CRM, with progress tracking via the ImportJob model.
"""

import asyncio
import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import Contact, ImportJob
from app.linkedin_service import get_linkedin_client
from app.utils.sync_lock import acquire_lock, release_lock

logger = logging.getLogger(__name__)


def run_import_connections(crm_id: int, li_at: str, jsessionid: str, import_job_id: int, user_id: int = None) -> None:
    """Synchronous entry point for BackgroundTasks."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_async_import(crm_id, li_at, jsessionid, import_job_id, user_id))
    finally:
        loop.close()


async def _async_import(crm_id: int, li_at: str, jsessionid: str, import_job_id: int, user_id: int = None) -> None:
    if user_id and not acquire_lock(user_id, "importing"):
        logger.warning("Import skipped for CRM %d: lock held for user %d", crm_id, user_id)
        return
    db = SessionLocal()
    try:
        job = db.query(ImportJob).filter(ImportJob.id == import_job_id).first()
        client = get_linkedin_client(li_at, jsessionid)

        logger.info("Import starting for CRM %d", crm_id)

        import json

        # Fetch ALL connections using the dedicated connections endpoint
        # (bypasses the search API which is limited to ~20 results)
        logger.info("Fetching all connections via /relationships/dash/connections endpoint")
        try:
            all_connections = await asyncio.to_thread(client.get_all_connections)
        except Exception:
            logger.exception("Failed to fetch connections via dedicated endpoint")
            all_connections = []

        logger.info("Fetched %d connections from LinkedIn", len(all_connections))

        total_created = 0
        total_skipped = 0
        skipped_list = []

        # Process in batches for progress updates
        batch_size = 50
        for i in range(0, len(all_connections), batch_size):
            batch = all_connections[i:i + batch_size]

            for person in batch:
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

                contact = Contact(
                    crm_id=crm_id,
                    urn_id=person_urn,
                    first_name=person.get("first_name") or person_name.split(" ", 1)[0],
                    last_name=person.get("last_name") or (person_name.split(" ", 1)[1] if " " in person_name else ""),
                    headline=person.get("jobtitle"),
                    location=person.get("location"),
                    profile_picture_url=person.get("picture_url"),
                    linkedin_url=person.get("navigation_url"),
                    connection_status="connected",
                )
                db.add(contact)
                total_created += 1

            try:
                db.commit()
            except Exception:
                db.rollback()
                # Retry one by one to skip duplicates
                for person in batch:
                    person_urn = person.get("urn_id")
                    if not person_urn:
                        continue
                    existing = db.query(Contact).filter(
                        Contact.crm_id == crm_id, Contact.urn_id == person_urn,
                    ).first()
                    if existing:
                        continue
                    person_name = person.get("name", "") or "Inconnu"
                    contact = Contact(
                        crm_id=crm_id,
                        urn_id=person_urn,
                        first_name=person.get("first_name") or person_name.split(" ", 1)[0],
                        last_name=person.get("last_name") or (person_name.split(" ", 1)[1] if " " in person_name else ""),
                        headline=person.get("jobtitle"),
                        location=person.get("location"),
                        profile_picture_url=person.get("picture_url"),
                        linkedin_url=person.get("navigation_url"),
                        connection_status="connected",
                    )
                    try:
                        db.add(contact)
                        db.flush()
                    except Exception:
                        db.rollback()
                db.commit()

            # Update progress
            if job:
                job.total_found = len(all_connections)
                job.total_created = total_created
                job.total_skipped = total_skipped
                job.skipped_details = json.dumps(skipped_list, ensure_ascii=False) if skipped_list else None
                db.commit()

            logger.info("Batch %d/%d done: created=%d, skipped=%d",
                        i // batch_size + 1, (len(all_connections) + batch_size - 1) // batch_size,
                        total_created, total_skipped)

        # Mark as completed
        if job:
            job.status = "completed"
            job.total_found = len(all_connections)
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
        if user_id:
            release_lock(user_id)
        db.close()


