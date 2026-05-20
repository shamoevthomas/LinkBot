"""
Search campaign job runner.

Searches LinkedIn for the campaign's keywords, adds all results to the
associated CRM, and completes immediately.  No tick-based batching —
the entire search runs in one go.
"""

import asyncio
import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from app.database import SessionLocal
from app.models import Campaign, CampaignAction, Contact, User, Blacklist
from app.linkedin_service import get_linkedin_client, search_people, resolve_geo_urn
from app.scheduler import cancel_campaign_job
from app.routers.notifications import create_notification

logger = logging.getLogger(__name__)

# LinkedIn returns max 10 per page
_PAGE_SIZE = 10


def _parse_search_locations(raw: str | None) -> list[str]:
    """Read campaign.search_regions which can be either:
    - JSON array of free-text locations (new): '["Lyon", "Île-de-France"]'
    - Comma-separated geoUrn IDs (legacy): "105015875,100565514"
    Returns the list of strings (each item may be free-text OR a geoUrn).
    """
    if not raw:
        return []
    s = raw.strip()
    if s.startswith("["):
        try:
            arr = json.loads(s)
            return [str(x).strip() for x in arr if str(x).strip()]
        except Exception:
            pass
    return [x.strip() for x in s.split(",") if x.strip()]


async def run_search_campaign(campaign_id: int) -> None:
    """Search LinkedIn and import all results into the CRM at once."""
    print(f"[SEARCH JOB] Campaign {campaign_id}: starting full search (will log keywords after DB read)", flush=True)
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            logger.error("Campaign %d not found, cancelling job", campaign_id)
            cancel_campaign_job(campaign_id)
            return

        if campaign.status != "running":
            return

        # --- get LinkedIn client ---
        user = db.query(User).filter(User.id == campaign.user_id).first()
        if not user or not user.li_at_cookie or not user.cookies_valid:
            campaign.status = "failed"
            campaign.error_message = "No valid LinkedIn cookies"
            db.commit()
            cancel_campaign_job(campaign_id)
            return

        client = get_linkedin_client(user.li_at_cookie, user.jsessionid_cookie)

        target = campaign.total_target or 50
        offset = campaign.search_offset or 0
        added = 0
        skipped = 0
        # search_regions is stored as JSON array of free-text location names
        # ("Lyon", "Île-de-France"...) OR legacy comma-CSV of geoUrns.
        raw_locations = _parse_search_locations(campaign.search_regions)

        # Resolve each free-text entry to a LinkedIn geoUrn. Numeric strings
        # are kept as-is (legacy geoUrn format). Names that fail to resolve
        # are dropped with a warning — the search still runs on whatever
        # resolved successfully (or all locations if none).
        resolved_geos: list[str] = []
        unresolved: list[str] = []
        for loc in raw_locations:
            if loc.isdigit():
                resolved_geos.append(loc)
                continue
            urn = await asyncio.to_thread(
                resolve_geo_urn, loc, user.li_at_cookie, user.jsessionid_cookie or ""
            )
            if urn:
                resolved_geos.append(urn)
                print(f"[SEARCH JOB] Campaign {campaign_id}: resolved {loc!r} → geoUrn {urn}", flush=True)
            else:
                unresolved.append(loc)
                print(f"[SEARCH JOB] Campaign {campaign_id}: could NOT resolve {loc!r} to a geoUrn — skipping this location", flush=True)

        # If the user specified locations but NONE resolved, abort the campaign
        # rather than running unfiltered (which silently returns random profiles
        # and misleads the user into thinking the location filter worked).
        if raw_locations and not resolved_geos:
            campaign.status = "paused"
            campaign.error_message = (
                f"Localisation(s) introuvable(s) sur LinkedIn: {', '.join(unresolved)}. "
                "Vérifie l'orthographe ou choisis une suggestion."
            )
            db.commit()
            cancel_campaign_job(campaign_id)
            try:
                create_notification(
                    db, user.id,
                    title="Localisation introuvable",
                    message=(
                        f"La campagne « {campaign.name} » a été mise en pause car aucune "
                        f"des localisations ({', '.join(unresolved)}) n'a pu être résolue "
                        "sur LinkedIn. Modifie la campagne et corrige l'orthographe."
                    ),
                    type="campaign_error",
                )
            except Exception:
                logger.exception("Failed to create notification for unresolved locations")
            print(
                f"[SEARCH JOB] Campaign {campaign_id}: aborted — none of {unresolved} resolved",
                flush=True,
            )
            return

        # Partial failure: some resolved, some didn't — proceed with what we have
        # but warn via error_message so it surfaces in the campaign detail page.
        if unresolved:
            campaign.error_message = (
                f"Localisations ignorées (introuvables): {', '.join(unresolved)}"
            )
            db.commit()

        print(f"[SEARCH JOB] Campaign {campaign_id}: keywords={campaign.keywords!r}, target={target}, geoUrns={resolved_geos}", flush=True)

        # ----- Per-city distribution with overflow ------------------------
        # When the user provides N cities for a target of T prospects we want
        # ~T/N from each city. If a city runs dry before hitting its share,
        # the remaining demand spills over to the cities that still have
        # results — so we always end up at T (or as close as LinkedIn allows).
        # ------------------------------------------------------------------
        seen_urns: set = set()

        async def _ingest_results(results: list) -> int:
            """Insert results as Contacts; return how many NEW (added) rows."""
            new_added = 0
            for person in results:
                urn_id = person.get("urn_id")
                if not urn_id:
                    nonlocal_skipped[0] += 1
                    _log_action(db, campaign.id, None, "search_add", "skipped", "No urn_id in result")
                    continue
                if urn_id in seen_urns:
                    continue
                seen_urns.add(urn_id)

                existing = db.query(Contact).filter(
                    Contact.crm_id == campaign.crm_id,
                    Contact.urn_id == urn_id,
                ).first()
                if existing:
                    nonlocal_skipped[0] += 1
                    _log_action(db, campaign.id, existing.id, "search_add", "skipped", "Duplicate")
                    continue
                if db.query(Blacklist).filter(Blacklist.urn_id == urn_id, Blacklist.user_id == campaign.user_id).first():
                    nonlocal_skipped[0] += 1
                    _log_action(db, campaign.id, None, "search_add", "skipped", "Blacklisted")
                    continue

                name = person.get("name", "") or ""
                parts = name.split(" ", 1)
                first_name = parts[0] if parts else ""
                last_name = parts[1] if len(parts) > 1 else ""

                contact = Contact(
                    crm_id=campaign.crm_id,
                    urn_id=urn_id,
                    public_id=person.get("public_id"),
                    first_name=first_name,
                    last_name=last_name,
                    headline=person.get("jobtitle"),
                    location=person.get("location"),
                    profile_picture_url=person.get("picture_url"),
                    linkedin_url=person.get("navigation_url"),
                    connection_status=person.get("distance", "unknown"),
                )
                db.add(contact)
                db.flush()
                _log_action(db, campaign.id, contact.id, "search_add", "success")
                new_added += 1
            return new_added

        # Use a single-element list so the inner closure can mutate skip count
        # without rebinding the outer name.
        nonlocal_skipped = [skipped]

        async def _search_one(geo_urn: str | None, page_offset: int, want: int) -> list:
            """Single search_people call. geo_urn=None means no filter."""
            kwargs = {
                "keywords": campaign.keywords or "",
                "limit": min(_PAGE_SIZE, want),
                "offset": page_offset,
            }
            if geo_urn is not None:
                kwargs["regions"] = [geo_urn]
            try:
                res = await search_people(client, **kwargs)
            except Exception as exc:
                logger.exception("Search failed for campaign %d (geo=%s)", campaign_id, geo_urn)
                campaign.error_message = f"Search error: {str(exc)[:300]}"
                return []
            print(
                f"[SEARCH JOB] Campaign {campaign_id}: geo={geo_urn or 'none'} "
                f"offset={page_offset}, want={want}, got={len(res)}",
                flush=True,
            )
            return res

        # No location filter → single-pass paginate until target or empty.
        if not resolved_geos:
            page_offset = offset
            while added < target:
                results = await _search_one(None, page_offset, target - added)
                if not results:
                    break
                page_offset += len(results)
                offset = page_offset
                added += await _ingest_results(results)
        else:
            # Per-city quotas. Use ceil so small remainders don't shortchange
            # any city (we'll cap at target globally below).
            n_cities = len(resolved_geos)
            base_quota = -(-target // n_cities)  # ceil divide
            per_city_added: dict[str, int] = {g: 0 for g in resolved_geos}
            per_city_offset: dict[str, int] = {g: 0 for g in resolved_geos}
            exhausted: set[str] = set()

            # ---- Pass 1: each city up to its base quota ------------------
            for geo in resolved_geos:
                while per_city_added[geo] < base_quota and added < target:
                    want = min(base_quota - per_city_added[geo], target - added)
                    # _search_one caps its request to _PAGE_SIZE — compare
                    # short-page detection against the size actually sent,
                    # not the city's remaining demand, or a single full
                    # page (_PAGE_SIZE results vs want=300) wrongly marks
                    # the city as exhausted.
                    batch_size = min(_PAGE_SIZE, want)
                    results = await _search_one(geo, per_city_offset[geo], want)
                    if not results:
                        exhausted.add(geo)
                        break
                    per_city_offset[geo] += len(results)
                    new = await _ingest_results(results)
                    per_city_added[geo] += new
                    added += new
                    if len(results) < batch_size:
                        exhausted.add(geo)
                        break

            # ---- Pass 2: overflow — redistribute deficit across cities --
            # Round-robin so cities share the leftover demand fairly. Stop
            # when target hit OR every remaining city is exhausted.
            while added < target and len(exhausted) < n_cities:
                progress_this_round = False
                for geo in resolved_geos:
                    if added >= target:
                        break
                    if geo in exhausted:
                        continue
                    want = min(_PAGE_SIZE, target - added)
                    results = await _search_one(geo, per_city_offset[geo], want)
                    if not results:
                        exhausted.add(geo)
                        continue
                    per_city_offset[geo] += len(results)
                    new = await _ingest_results(results)
                    per_city_added[geo] += new
                    added += new
                    progress_this_round = True
                    if len(results) < want:
                        exhausted.add(geo)
                if not progress_this_round:
                    break

            # Persist the largest offset so a future re-run resumes roughly
            # past what we've already pulled (cosmetic — search jobs are
            # one-shot today).
            offset = max(per_city_offset.values(), default=offset)

            print(
                f"[SEARCH JOB] Campaign {campaign_id}: per-city result "
                + ", ".join(f"{g}={per_city_added[g]}" for g in resolved_geos),
                flush=True,
            )

        skipped = nonlocal_skipped[0]

        # Update counters and complete
        campaign.search_offset = offset
        campaign.total_processed = (campaign.total_processed or 0) + added + skipped
        campaign.total_succeeded = (campaign.total_succeeded or 0) + added
        campaign.total_skipped = (campaign.total_skipped or 0) + skipped
        campaign.status = "completed"
        campaign.completed_at = datetime.utcnow()
        db.commit()

        cancel_campaign_job(campaign_id)
        create_notification(
            db, campaign.user_id, "campaign_completed",
            f'Recherche "{campaign.name}" terminee',
            f"{added} contact(s) ajoute(s), {skipped} ignore(s)",
        )
        db.commit()

        logger.info(
            "Campaign %d completed: added %d, skipped %d",
            campaign_id, added, skipped,
        )
        print(f"[SEARCH JOB] Campaign {campaign_id}: done — {added} added, {skipped} skipped", flush=True)

    except Exception as exc:
        logger.exception("Unexpected error in search campaign %d", campaign_id)
        try:
            db.rollback()
            from app.models import Campaign as _C
            c = db.query(_C).filter(_C.id == campaign_id).first()
            if c:
                c.error_message = f"[{datetime.now(ZoneInfo('Europe/Paris')).strftime('%H:%M:%S')}] {type(exc).__name__}: {str(exc)[:300]}"
                c.status = "completed"
                c.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _log_action(
    db,
    campaign_id: int,
    contact_id: int | None,
    action_type: str,
    action_status: str,
    error_message: str | None = None,
) -> None:
    db.add(CampaignAction(
        campaign_id=campaign_id,
        contact_id=contact_id,
        action_type=action_type,
        status=action_status,
        error_message=error_message,
    ))
