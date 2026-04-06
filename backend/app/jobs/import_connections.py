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

        logger.info("Import starting for CRM %d", crm_id)

        import json

        offset = 0
        total_created = 0
        total_skipped = 0
        skipped_list = []  # [{name, reason}]
        empty_rounds = 0  # consecutive rounds with 0 results

        while True:
            try:
                # Use network_depths=["F"] to search all 1st-degree connections.
                # This is more reliable than connectionOf which LinkedIn now limits.
                connections = await asyncio.to_thread(
                    client.search_people,
                    network_depths=["F"],
                    limit=_PAGE_SIZE,
                    offset=offset,
                )
                connections = connections or []
            except Exception:
                logger.exception("Error fetching connections at offset %d", offset)
                break

            if not connections:
                empty_rounds += 1
                if empty_rounds >= 3:
                    logger.info("3 consecutive empty rounds at offset %d — stopping", offset)
                    break
                logger.info("Empty result at offset %d (attempt %d/3), advancing", offset, empty_rounds)
                offset += _PAGE_SIZE
                continue

            empty_rounds = 0  # reset on success

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

            try:
                db.commit()
            except Exception:
                db.rollback()
                # Retry contacts one by one to skip only the duplicates
                for person in connections:
                    person_urn = person.get("urn_id")
                    if not person_urn:
                        continue
                    existing = db.query(Contact).filter(
                        Contact.crm_id == crm_id, Contact.urn_id == person_urn,
                    ).first()
                    if existing:
                        continue
                    person_name = person.get("name", "") or "Inconnu"
                    parts = person_name.split(" ", 1)
                    contact = Contact(
                        crm_id=crm_id,
                        urn_id=person_urn,
                        first_name=parts[0] if parts else "",
                        last_name=parts[1] if len(parts) > 1 else "",
                        headline=person.get("jobtitle"),
                        location=person.get("location"),
                        linkedin_url=person.get("navigation_url"),
                        connection_status="connected",
                    )
                    try:
                        db.add(contact)
                        db.flush()
                    except Exception:
                        db.rollback()
                db.commit()
            offset += len(connections)

            # Update progress in real time
            if job:
                job.total_found = offset
                job.total_created = total_created
                job.total_skipped = total_skipped
                job.skipped_details = json.dumps(skipped_list, ensure_ascii=False) if skipped_list else None
                db.commit()

            logger.info("Batch done: offset=%d, created=%d, skipped=%d", offset, total_created, total_skipped)

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


