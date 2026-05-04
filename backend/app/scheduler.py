"""
Simple asyncio-based campaign scheduler.

Replaces APScheduler which failed to fire jobs on Render.
Uses a single background asyncio loop that checks registered campaigns
and runs their jobs when due. Guaranteed to work on uvicorn's event loop.
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Registry: campaign_id -> {type, interval, jitter, last_run, next_run, paused}
_campaigns: Dict[int, dict] = {}
_loop_task: Optional[asyncio.Task] = None
_shutdown = False

# Sync connections tracking
_last_sync_connections: Optional[datetime] = None
SYNC_CONNECTIONS_INTERVAL = 6 * 3600  # 6 hours

# Reply checker tracking (runs every 5 minutes)
_last_reply_check: Optional[datetime] = None
REPLY_CHECK_INTERVAL = 300  # 5 minutes

# Profile picture enrichment (runs every 15 minutes, slow drip)
_last_enrich_pictures: Optional[datetime] = None
ENRICH_PICTURES_INTERVAL = 15 * 60  # 15 minutes


# ---------------------------------------------------------------------------
# Campaign job runner
# ---------------------------------------------------------------------------

async def _run_campaign_tick(campaign_id: int, campaign_type: str):
    """Run one tick of a campaign job."""
    if campaign_type == "search":
        from app.jobs.search_campaign import run_search_campaign
        await run_search_campaign(campaign_id)
    elif campaign_type == "dm":
        from app.jobs.dm_campaign import run_dm_campaign
        await run_dm_campaign(campaign_id)
    elif campaign_type == "connection":
        from app.jobs.connection_campaign import run_connection_campaign
        await run_connection_campaign(campaign_id)
    elif campaign_type == "connection_dm":
        from app.jobs.connection_dm_campaign import run_connection_dm_campaign
        await run_connection_dm_campaign(campaign_id)
    elif campaign_type == "search_connection_dm":
        from app.jobs.search_connection_dm_campaign import run_search_connection_dm_campaign
        await run_search_connection_dm_campaign(campaign_id)
    elif campaign_type == "export":
        from app.jobs.export_campaign import run_export_campaign
        await run_export_campaign(campaign_id)
    elif campaign_type == "lead_magnet":
        from app.jobs.lead_magnet_job import run_lead_magnet_tick
        await run_lead_magnet_tick(campaign_id)
    else:
        logger.warning("Unknown campaign type: %s", campaign_type)


async def _run_sync_connections():
    """Run the periodic connection sync."""
    global _last_sync_connections
    try:
        from app.jobs.sync_connections import sync_new_connections
        await sync_new_connections()
        _last_sync_connections = datetime.utcnow()
        print("[SCHEDULER] sync_connections completed", flush=True)
    except Exception:
        logger.exception("Error in sync_connections")


async def _run_reply_checks():
    """Run reply detection for all running DM campaigns."""
    global _last_reply_check
    try:
        from app.jobs.reply_checker import run_reply_checks
        await run_reply_checks()
        _last_reply_check = datetime.utcnow()
    except Exception:
        logger.exception("Error in reply checker")


async def _run_enrich_pictures():
    """Backfill missing profile pictures (slow drip)."""
    global _last_enrich_pictures
    try:
        from app.jobs.enrich_pictures import run_enrich_pictures
        await run_enrich_pictures()
        _last_enrich_pictures = datetime.utcnow()
    except Exception:
        logger.exception("Error in enrich pictures")


# ---------------------------------------------------------------------------
# Main background loop
# ---------------------------------------------------------------------------

async def _main_loop():
    """Background loop that checks and runs campaign jobs."""
    global _shutdown, _last_reply_check
    print("[SCHEDULER] Main loop started", flush=True)

    while not _shutdown:
        try:
            now = datetime.utcnow()

            # Check replies (every 5 minutes)
            if (_last_reply_check is None or
                    (now - _last_reply_check).total_seconds() >= REPLY_CHECK_INTERVAL):
                await _run_reply_checks()

            # Backfill missing profile pictures (every 15 minutes, slow drip)
            if (_last_enrich_pictures is None or
                    (now - _last_enrich_pictures).total_seconds() >= ENRICH_PICTURES_INTERVAL):
                await _run_enrich_pictures()

            # Check each registered campaign
            for cid, info in list(_campaigns.items()):
                if info.get("paused"):
                    continue
                if now >= info["next_run"]:
                    # Skip if THIS user's family is in rate-limit cooldown (lead magnets exempt)
                    owner_uid = info.get("user_id")
                    from app.database import SessionLocal
                    from app.utils.rate_limit_cooldown import is_campaign_blocked
                    db = SessionLocal()
                    try:
                        blocked_family = is_campaign_blocked(db, info["type"], owner_uid)
                    finally:
                        db.close()
                    if blocked_family:
                        print(
                            f"[SCHEDULER] Skipping {cid} ({info['type']}, user={owner_uid}): {blocked_family} cooldown active",
                            flush=True,
                        )
                        info["last_run"] = datetime.utcnow()
                        info["next_run"] = info["last_run"] + timedelta(seconds=300)
                        continue

                    print(f"[SCHEDULER] Firing campaign {cid} ({info['type']}, user={owner_uid})", flush=True)
                    try:
                        # For lead magnets, extract numeric ID from "lm_5" key
                        tick_id = int(str(cid).replace("lm_", "")) if info["type"] == "lead_magnet" else cid
                        await _run_campaign_tick(tick_id, info["type"])
                    except Exception:
                        logger.exception("Error running campaign %s", cid)

                    # Dynamic interval: recalculate based on remaining quota & time
                    # Lead magnets use their own fixed check interval
                    if info["type"] == "lead_magnet" or owner_uid is None:
                        dynamic_secs = info["interval"]
                    else:
                        dynamic_secs = _compute_dynamic_interval(info["type"], owner_uid)
                    info["last_run"] = datetime.utcnow()
                    info["next_run"] = info["last_run"] + timedelta(seconds=dynamic_secs)
                    print(
                        f"[SCHEDULER] Campaign {cid}: next run in {dynamic_secs}s",
                        flush=True,
                    )

        except Exception:
            logger.exception("Error in scheduler main loop")

        await asyncio.sleep(5)  # Check every 5 seconds

    print("[SCHEDULER] Main loop stopped", flush=True)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

async def init_scheduler():
    """Start the background scheduler loop. Must be called with await."""
    global _loop_task, _shutdown
    _shutdown = False
    if _loop_task is None or _loop_task.done():
        _loop_task = asyncio.create_task(_main_loop())
        print("[SCHEDULER] Initialized", flush=True)


def get_scheduler():
    """Compatibility stub — returns None (no APScheduler)."""
    return None


def shutdown_scheduler():
    """Stop the background loop."""
    global _shutdown
    _shutdown = True
    if _loop_task and not _loop_task.done():
        _loop_task.cancel()
    print("[SCHEDULER] Shutdown requested", flush=True)


# ---------------------------------------------------------------------------
# Interval calculation
# ---------------------------------------------------------------------------

def _get_schedule_interval(max_per_day: int, user_id: int) -> int | None:
    """If the user's schedule is enabled, compute interval from window and daily limit."""
    from app.database import SessionLocal
    from app.utils.settings import get_setting

    db = SessionLocal()
    try:
        enabled = get_setting(db, user_id, "schedule_enabled", "false")
        if not enabled or str(enabled).lower() != "true":
            return None

        start_val = get_setting(db, user_id, "schedule_start_hour", "08:00") or "08:00"
        end_val = get_setting(db, user_id, "schedule_end_hour", "20:00") or "20:00"

        start_h, start_m = map(int, start_val.split(":"))
        end_h, end_m = map(int, end_val.split(":"))
        start_min = start_h * 60 + start_m
        end_min = end_h * 60 + end_m

        if end_min <= start_min:
            window_min = (1440 - start_min) + end_min
        else:
            window_min = end_min - start_min

        if max_per_day <= 0 or window_min <= 0:
            return None

        interval = (window_min * 60) // max_per_day
        return max(30, interval)
    except Exception:
        return None
    finally:
        db.close()


def _compute_dynamic_interval(campaign_type: str, user_id: int) -> int:
    """Compute next tick interval so the user's daily limit is reached.

    Formula: remaining_time_in_window / remaining_actions
    If schedule is disabled, distributes over remaining hours until midnight.
    Adds small jitter (10%) for human-like timing.
    """
    from datetime import datetime as _dt, timezone as _tz
    from zoneinfo import ZoneInfo
    from app.database import SessionLocal
    from app.utils.settings import get_setting

    db = SessionLocal()
    try:
        # 1. Daily limit for this campaign type
        if campaign_type in ("dm", "connection_dm", "search_connection_dm"):
            limit_key = "max_dms_per_day"
            action_types = ["dm_send"]
        else:
            limit_key = "max_connections_per_day"
            action_types = ["connection_request"]

        raw_limit = int(get_setting(db, user_id, limit_key, "25") or "25")
        daily_limit = get_effective_daily_limit(raw_limit, user_id, db)

        # 2. How many successful actions done today (this user)
        done_today = get_user_actions_today(action_types, user_id, db)
        remaining = daily_limit - done_today

        if remaining <= 0:
            print(f"[SCHEDULER] Dynamic interval (user {user_id}): limit reached ({done_today}/{daily_limit}), sleeping 1h", flush=True)
            return 3600

        # 3. Remaining time in schedule window (or until midnight)
        tz_name = get_setting(db, user_id, "schedule_timezone", "Europe/Paris") or "Europe/Paris"
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Europe/Paris")

        now_local = _dt.now(_tz.utc).astimezone(tz)

        schedule_on = (get_setting(db, user_id, "schedule_enabled", "false") or "false").lower() == "true"

        if not schedule_on:
            # Schedule disabled — use manual interval settings (user controls timing)
            interval_min_v = int(get_setting(db, user_id, "action_interval_min", "2") or "2") * 60
            interval_max_v = int(get_setting(db, user_id, "action_interval_max", "5") or "5") * 60
            if interval_max_v < interval_min_v:
                interval_max_v = interval_min_v
            return random.randint(interval_min_v, interval_max_v)

        # Schedule enabled — dynamic: remaining_time / remaining_actions
        end_val = get_setting(db, user_id, "schedule_end_hour", "20:00") or "20:00"
        end_h, end_m = map(int, end_val.split(":"))
        end_today = now_local.replace(hour=end_h, minute=end_m, second=0, microsecond=0)

        if end_today <= now_local:
            return 3600  # Past schedule window
        remaining_secs = (end_today - now_local).total_seconds()

        # 4. Interval = time_left / actions_left
        interval = int(remaining_secs / remaining)

        # 5. Small jitter (10%) for human-like timing
        jitter = random.randint(0, max(5, int(interval * 0.1)))

        # 6. Clamp: min 30s, max 1h
        final = max(30, min(3600, interval + jitter))

        print(
            f"[SCHEDULER] Dynamic interval: {done_today}/{daily_limit} done, "
            f"{remaining} left, {int(remaining_secs)}s window -> {final}s",
            flush=True,
        )
        return final

    except Exception:
        logger.exception("Error computing dynamic interval")
        return 300  # Fallback: 5 min
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Campaign job management
# ---------------------------------------------------------------------------

def schedule_campaign_job(
    campaign_id,
    campaign_type: str,
    interval_seconds: Optional[int] = None,
) -> None:
    """Register a campaign for periodic execution.

    campaign_id can be int (campaigns) or str like "lm_5" (lead magnets).
    """
    from app.database import SessionLocal
    from app.models import LeadMagnet, Campaign
    from app.utils.settings import get_setting

    # Remove existing entry
    _campaigns.pop(campaign_id, None)

    # Determine interval
    db = SessionLocal()
    try:
        # Resolve owner user_id (needed for per-user settings + cooldown checks)
        if campaign_type == "lead_magnet":
            lm_id = int(str(campaign_id).replace("lm_", ""))
            lm = db.query(LeadMagnet).filter(LeadMagnet.id == lm_id).first()
            owner_user_id = lm.user_id if lm else None
            interval = lm.check_interval_seconds if lm else 300
            jitter = 0  # Fixed interval, no jitter
        else:
            c = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            owner_user_id = c.user_id if c else None

            limit_key = "max_dms_per_day" if campaign_type in ("dm", "connection_dm", "search_connection_dm") else "max_connections_per_day"
            daily_limit = int(get_setting(db, owner_user_id, limit_key, "25") or "25")

            schedule_interval = _get_schedule_interval(daily_limit, owner_user_id) if owner_user_id else None

            if schedule_interval:
                interval = schedule_interval
                jitter = max(15, int(interval * 0.5))
            else:
                interval_min = int(get_setting(db, owner_user_id, "action_interval_min", "2") or "2") * 60
                interval_max = int(get_setting(db, owner_user_id, "action_interval_max", "5") or "5") * 60
                if interval_max < interval_min:
                    interval_max = interval_min
                interval = interval_min
                jitter = max(0, interval_max - interval_min)
    finally:
        db.close()

    now = datetime.utcnow()
    # Lead magnets run immediately on start; campaigns stagger 10-30s
    first_delay = 0 if campaign_type == "lead_magnet" else random.randint(10, 30)

    _campaigns[campaign_id] = {
        "type": campaign_type,
        "user_id": owner_user_id,
        "interval": interval,
        "jitter": jitter,
        "last_run": None,
        "next_run": now + timedelta(seconds=first_delay),
        "paused": False,
    }

    print(
        f"[SCHEDULER] Registered campaign {campaign_id} ({campaign_type}, user={owner_user_id}) "
        f"every {interval}s (jitter {jitter}s), first run in {first_delay}s",
        flush=True,
    )


def pause_campaign_job(campaign_id) -> None:
    """Pause a campaign."""
    if campaign_id in _campaigns:
        _campaigns[campaign_id]["paused"] = True
        print(f"[SCHEDULER] Paused campaign {campaign_id}", flush=True)


def resume_campaign_job(campaign_id) -> None:
    """Resume a paused campaign."""
    if campaign_id in _campaigns:
        _campaigns[campaign_id]["paused"] = False
        _campaigns[campaign_id]["next_run"] = datetime.utcnow()
        print(f"[SCHEDULER] Resumed campaign {campaign_id}", flush=True)


def trigger_campaign_now(campaign_id) -> bool:
    """Force next tick to run immediately. Returns True if campaign exists."""
    if campaign_id in _campaigns and not _campaigns[campaign_id]["paused"]:
        _campaigns[campaign_id]["next_run"] = datetime.utcnow()
        print(f"[SCHEDULER] Triggered immediate run for {campaign_id}", flush=True)
        return True
    return False


def cancel_campaign_job(campaign_id) -> None:
    """Remove a campaign from the scheduler."""
    removed = _campaigns.pop(campaign_id, None)
    if removed:
        print(f"[SCHEDULER] Cancelled campaign {campaign_id}", flush=True)


def get_campaign_next_run_time(campaign_id):
    """Return the next scheduled run time for a campaign, or None."""
    info = _campaigns.get(campaign_id)
    if info and not info.get("paused"):
        return info["next_run"]
    return None


# ---------------------------------------------------------------------------
# Schedule window helpers
# ---------------------------------------------------------------------------

def is_within_schedule(user_id: int, db_session=None) -> bool:
    """Check if the current time is within the user's configured schedule window.

    Returns True (allowed) if schedule is disabled, not configured, or user_id is None.
    Uses the user's configured timezone (defaults to Europe/Paris).
    """
    from datetime import datetime as _dt, timezone as _tz
    from zoneinfo import ZoneInfo
    from app.database import SessionLocal
    from app.utils.settings import get_setting

    if user_id is None:
        return True
    db = db_session or SessionLocal()
    try:
        enabled = (get_setting(db, user_id, "schedule_enabled", "false") or "false").lower()
        if enabled != "true":
            return True

        start_val = get_setting(db, user_id, "schedule_start_hour", "08:00") or "08:00"
        end_val = get_setting(db, user_id, "schedule_end_hour", "20:00") or "20:00"

        try:
            start_h, start_m = map(int, start_val.split(":"))
            end_h, end_m = map(int, end_val.split(":"))
        except (ValueError, AttributeError):
            return True

        tz_name = get_setting(db, user_id, "schedule_timezone", "Europe/Paris") or "Europe/Paris"
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Europe/Paris")

        now = _dt.now(_tz.utc).astimezone(tz)
        current_minutes = now.hour * 60 + now.minute
        start_minutes = start_h * 60 + start_m
        end_minutes = end_h * 60 + end_m

        if start_minutes <= end_minutes:
            return start_minutes <= current_minutes < end_minutes
        else:
            return current_minutes >= start_minutes or current_minutes < end_minutes
    finally:
        if not db_session:
            db.close()


def get_next_schedule_start(user_id: int, db_session=None):
    """Return the next schedule window start (UTC) for a given user."""
    from datetime import datetime as _dt, timedelta, timezone as _tz
    from zoneinfo import ZoneInfo
    from app.database import SessionLocal
    from app.utils.settings import get_setting

    if user_id is None:
        return None
    db = db_session or SessionLocal()
    try:
        start_val = get_setting(db, user_id, "schedule_start_hour", "08:00") or "08:00"
        try:
            start_h, start_m = map(int, start_val.split(":"))
        except (ValueError, AttributeError):
            return None

        tz_name = get_setting(db, user_id, "schedule_timezone", "Europe/Paris") or "Europe/Paris"
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Europe/Paris")

        now = _dt.now(_tz.utc).astimezone(tz)
        today_start = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)

        if now < today_start:
            return today_start.astimezone(_tz.utc)
        else:
            return (today_start + timedelta(days=1)).astimezone(_tz.utc)
    except Exception:
        return None
    finally:
        if not db_session:
            db.close()


def get_user_actions_today(action_types: list, user_id: int, db_session=None) -> int:
    """Count today's successful actions for ONE user (joined via campaign.user_id)."""
    from datetime import datetime as _dt, date as _date
    from sqlalchemy import func
    from app.database import SessionLocal
    from app.models import CampaignAction, Campaign

    db = db_session or SessionLocal()
    try:
        today_start = _dt.combine(_date.today(), _dt.min.time())
        count = (
            db.query(func.count(CampaignAction.id))
            .join(Campaign, CampaignAction.campaign_id == Campaign.id)
            .filter(
                CampaignAction.action_type.in_(action_types),
                CampaignAction.status == "success",
                CampaignAction.created_at >= today_start,
                Campaign.user_id == user_id,
            )
            .scalar()
            or 0
        )
        return count
    except Exception:
        return 0
    finally:
        if not db_session:
            db.close()


# Backwards-compat shim: kept for any caller that hasn't migrated yet.
# Returns 0 if no user_id is given (behaviour change is intentional — global counts
# leak across users in multi-tenant; we now require an explicit user scope).
def get_global_actions_today(action_types: list, db_session=None) -> int:
    return 0


WARMUP_MAX_DAYS = 6


def get_effective_daily_limit(base_limit: int, user_id: int, db_session=None) -> int:
    """Apply the user's warmup curve to the base daily limit if warmup is enabled."""
    from datetime import date as _date
    from app.database import SessionLocal
    from app.utils.settings import get_setting

    if user_id is None:
        return base_limit
    db = db_session or SessionLocal()
    try:
        enabled = (get_setting(db, user_id, "warmup_enabled", "false") or "false").lower()
        if enabled != "true":
            return base_limit

        start_limit = int(get_setting(db, user_id, "warmup_start_limit", "5") or "5")
        warmup_days = int(get_setting(db, user_id, "warmup_days", str(WARMUP_MAX_DAYS)) or WARMUP_MAX_DAYS)
        warmup_days = max(1, min(warmup_days, WARMUP_MAX_DAYS))
        started_at_str = get_setting(db, user_id, "warmup_started_at", "")

        if start_limit >= base_limit:
            return base_limit
        if not started_at_str:
            return base_limit

        started_at = _date.fromisoformat(started_at_str)
        elapsed = (_date.today() - started_at).days

        if elapsed >= warmup_days:
            return base_limit

        effective = start_limit + (base_limit - start_limit) * elapsed / warmup_days
        return min(base_limit, int(effective))
    except Exception:
        return base_limit
    finally:
        if not db_session:
            db.close()
