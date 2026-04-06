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

        # Flag to use network_depths fallback if connectionOf returns 0
        use_network_fallback = False
        if not urn_id or urn_id.isdigit():
            logger.warning("URN extraction gave '%s' — will use network_depths fallback", urn_id)
            use_network_fallback = True

        if not urn_id and not use_network_fallback:
            logger.error("Could not determine current user URN for import")
            if job:
                job.status = "failed"
                job.error_message = "Could not determine your LinkedIn URN"
                job.completed_at = datetime.utcnow()
                db.commit()
            return

        logger.info("Import starting for CRM %d with URN: %s (fallback=%s)", crm_id, urn_id, use_network_fallback)

        import json

        offset = 0
        total_created = 0
        total_skipped = 0
        skipped_list = []  # [{name, reason}]
        empty_rounds = 0  # consecutive rounds with 0 results

        while True:
            try:
                # Use network_depths=F as primary — it's the most reliable way
                # to get ALL 1st-degree connections via the authenticated session.
                # connectionOf can be used as fallback but has stricter limits.
                if not use_network_fallback:
                    connections = await get_user_connections(
                        client, urn_id=urn_id, limit=_PAGE_SIZE, offset=offset,
                    )
                else:
                    connections = []

                # Switch to network_depths if connectionOf returns 0 on first call
                if not connections and offset == 0 and not use_network_fallback:
                    logger.info("connectionOf returned 0, switching to network_depths=F")
                    use_network_fallback = True

                if use_network_fallback and not connections:
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
                # LinkedIn sometimes returns empty pages mid-pagination.
                # Retry up to 3 times with advancing offset before giving up.
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


def _extract_urn(profile_data: dict) -> str:
    """Extract the user's URN ID from the get_user_profile response.

    The Voyager API returns the profile in `included[]` with a
    `dashEntityUrn` like `urn:li:fsd_profile:ACoAA...`.
    Handles both normalized JSON and flat response formats.
    """
    if not isinstance(profile_data, dict):
        return ""

    logger.info("[URN] /me response top-level keys: %s", list(profile_data.keys()))

    # 1. Try included[] array (normalized Voyager format)
    for item in profile_data.get("included", []):
        dash_urn = item.get("dashEntityUrn", "")
        if "fsd_profile" in dash_urn:
            urn = dash_urn.split(":")[-1]
            logger.info("[URN] Extracted from included[].dashEntityUrn: %s", urn)
            return urn

    # 2. Try included[].entityUrn with fs_miniProfile (same ID format)
    for item in profile_data.get("included", []):
        entity_urn = item.get("entityUrn", "")
        if "fs_miniProfile" in entity_urn:
            urn = entity_urn.split(":")[-1]
            logger.info("[URN] Extracted from included[].entityUrn (miniProfile): %s", urn)
            return urn

    # 3. Try flat miniProfile (non-normalized response)
    mini = profile_data.get("miniProfile", {})
    if isinstance(mini, dict):
        for key in ("dashEntityUrn", "entityUrn"):
            val = mini.get(key, "")
            if val and ("fsd_profile" in val or "fs_miniProfile" in val):
                urn = val.split(":")[-1]
                logger.info("[URN] Extracted from miniProfile.%s: %s", key, urn)
                return urn

    # 4. Try data.miniProfile or data.*miniProfile (normalized reference)
    data_block = profile_data.get("data", {})
    if isinstance(data_block, dict):
        data_mini = data_block.get("miniProfile", {})
        if isinstance(data_mini, dict):
            for key in ("dashEntityUrn", "entityUrn"):
                val = data_mini.get(key, "")
                if val and ("fsd_profile" in val or "fs_miniProfile" in val):
                    urn = val.split(":")[-1]
                    logger.info("[URN] Extracted from data.miniProfile.%s: %s", key, urn)
                    return urn

    # 5. Try profile_id or publicIdentifier at top level
    for key in ("profile_id", "publicIdentifier"):
        val = profile_data.get(key) or (data_block.get(key) if isinstance(data_block, dict) else None)
        if val:
            logger.info("[URN] Extracted from %s: %s", key, val)
            return str(val)

    # 6. Try objectUrn in included
    for item in profile_data.get("included", []):
        obj_urn = item.get("objectUrn", "")
        if obj_urn:
            urn = obj_urn.split(":")[-1]
            logger.info("[URN] Extracted from included[].objectUrn: %s", urn)
            return urn

    # 7. Try data.plainId as last resort (numeric — may not work with connectionOf)
    plain_id = data_block.get("plainId") if isinstance(data_block, dict) else None
    if not plain_id:
        plain_id = profile_data.get("plainId")
    if plain_id:
        logger.warning("[URN] Using plainId as fallback (may not work): %s", plain_id)
        return str(plain_id)

    logger.error("[URN] Could not extract URN. Response sample: %s", str(profile_data)[:500])
    return ""
