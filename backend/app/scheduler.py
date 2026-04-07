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


# ---------------------------------------------------------------------------
# Main background loop
# ---------------------------------------------------------------------------

async def _main_loop():
    """Background loop that checks and runs campaign jobs."""
    global _shutdown, _last_sync_connections, _last_reply_check
    print("[SCHEDULER] Main loop started", flush=True)

    # Run sync_connections once at startup (after 30s delay)
    await asyncio.sleep(30)
    await _run_sync_connections()

    while not _shutdown:
        try:
            now = datetime.utcnow()

            # Check sync_connections (every 6 hours)
            if (_last_sync_connections is None or
                    (now - _last_sync_connections).total_seconds() >= SYNC_CONNECTIONS_INTERVAL):
                await _run_sync_connections()

            # Check replies (every 5 minutes)
            if (_last_reply_check is None or
                    (now - _last_reply_check).total_seconds() >= REPLY_CHECK_INTERVAL):
                await _run_reply_checks()

            # Check each registered campaign
            for cid, info in list(_campaigns.items()):
                if info.get("paused"):
                    continue
                if now >= info["next_run"]:
                    print(f"[SCHEDULER] Firing campaign {cid} ({info['type']})", flush=True)
                    try:
                        await _run_campaign_tick(cid, info["type"])
                    except Exception:
                        logger.exception("Error running campaign %d", cid)

                    # Schedule next run with jitter
                    jitter_secs = random.randint(0, info["jitter"])
                    info["last_run"] = datetime.utcnow()
                    info["next_run"] = info["last_run"] + timedelta(
                        seconds=info["interval"] + jitter_secs
                    )
                    print(
                        f"[SCHEDULER] Campaign {cid}: next run in {info['interval'] + jitter_secs}s",
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

def _get_schedule_interval(max_per_day: int) -> int | None:
    """If schedule is enabled, compute interval from the time window and daily limit."""
    from app.database import SessionLocal
    from app.models import AppSettings

    db = SessionLocal()
    try:
        enabled = db.query(AppSettings).filter(AppSettings.key == "schedule_enabled").first()
        if not enabled or enabled.value.lower() != "true":
            return None

        start_row = db.query(AppSettings).filter(AppSettings.key == "schedule_start_hour").first()
        end_row = db.query(AppSettings).filter(AppSettings.key == "schedule_end_hour").first()
        start_val = start_row.value if start_row and start_row.value else "08:00"
        end_val = end_row.value if end_row and end_row.value else "20:00"

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


# ---------------------------------------------------------------------------
# Campaign job management
# ---------------------------------------------------------------------------

def schedule_campaign_job(
    campaign_id: int,
    campaign_type: str,
    interval_seconds: Optional[int] = None,
) -> None:
    """Register a campaign for periodic execution."""
    from app.database import SessionLocal
    from app.models import AppSettings

    # Remove existing entry
    _campaigns.pop(campaign_id, None)

    # Determine interval
    db = SessionLocal()
    try:
        limit_key = "max_dms_per_day" if campaign_type in ("dm",) else "max_connections_per_day"
        row = db.query(AppSettings).filter(AppSettings.key == limit_key).first()
        daily_limit = int(row.value) if row else 25

        schedule_interval = _get_schedule_interval(daily_limit)

        if schedule_interval:
            interval = schedule_interval
            jitter = max(15, int(interval * 0.5))
        else:
            # Use user-configured interval range (in minutes)
            min_row = db.query(AppSettings).filter(AppSettings.key == "action_interval_min").first()
            max_row = db.query(AppSettings).filter(AppSettings.key == "action_interval_max").first()
            interval_min = int(min_row.value) * 60 if min_row and min_row.value else 120  # 2 min default
            interval_max = int(max_row.value) * 60 if max_row and max_row.value else 300  # 5 min default
            if interval_max < interval_min:
                interval_max = interval_min
            interval = interval_min
            jitter = max(0, interval_max - interval_min)
    finally:
        db.close()

    now = datetime.utcnow()
    # First run after a short random delay (10-30s) to stagger campaigns
    first_delay = random.randint(10, 30)

    _campaigns[campaign_id] = {
        "type": campaign_type,
        "interval": interval,
        "jitter": jitter,
        "last_run": None,
        "next_run": now + timedelta(seconds=first_delay),
        "paused": False,
    }

    print(
        f"[SCHEDULER] Registered campaign {campaign_id} ({campaign_type}) "
        f"every {interval}s (jitter {jitter}s), first run in {first_delay}s",
        flush=True,
    )


def pause_campaign_job(campaign_id: int) -> None:
    """Pause a campaign."""
    if campaign_id in _campaigns:
        _campaigns[campaign_id]["paused"] = True
        print(f"[SCHEDULER] Paused campaign {campaign_id}", flush=True)


def resume_campaign_job(campaign_id: int) -> None:
    """Resume a paused campaign."""
    if campaign_id in _campaigns:
        _campaigns[campaign_id]["paused"] = False
        _campaigns[campaign_id]["next_run"] = datetime.utcnow() + timedelta(seconds=10)
        print(f"[SCHEDULER] Resumed campaign {campaign_id}", flush=True)


def cancel_campaign_job(campaign_id: int) -> None:
    """Remove a campaign from the scheduler."""
    removed = _campaigns.pop(campaign_id, None)
    if removed:
        print(f"[SCHEDULER] Cancelled campaign {campaign_id}", flush=True)


def get_campaign_next_run_time(campaign_id: int):
    """Return the next scheduled run time for a campaign, or None."""
    info = _campaigns.get(campaign_id)
    if info and not info.get("paused"):
        return info["next_run"]
    return None


# ---------------------------------------------------------------------------
# Schedule window helpers
# ---------------------------------------------------------------------------

def is_within_schedule(db_session=None) -> bool:
    """Check if the current time is within the configured schedule window.

    Returns True (allowed) if schedule is disabled or not configured.
    Uses the configured timezone (defaults to Europe/Paris).
    """
    from datetime import datetime as _dt, timezone as _tz
    from zoneinfo import ZoneInfo
    from app.database import SessionLocal
    from app.models import AppSettings

    db = db_session or SessionLocal()
    try:
        enabled_row = db.query(AppSettings).filter(AppSettings.key == "schedule_enabled").first()
        if not enabled_row or enabled_row.value.lower() != "true":
            return True

        start_row = db.query(AppSettings).filter(AppSettings.key == "schedule_start_hour").first()
        end_row = db.query(AppSettings).filter(AppSettings.key == "schedule_end_hour").first()

        # Default to 08:00-20:00 when schedule is enabled but hours not configured
        start_val = start_row.value if start_row and start_row.value else "08:00"
        end_val = end_row.value if end_row and end_row.value else "20:00"

        try:
            start_h, start_m = map(int, start_val.split(":"))
            end_h, end_m = map(int, end_val.split(":"))
        except (ValueError, AttributeError):
            return True

        # Use configured timezone
        tz_row = db.query(AppSettings).filter(AppSettings.key == "schedule_timezone").first()
        tz_name = tz_row.value if tz_row and tz_row.value else "Europe/Paris"
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


def get_next_schedule_start(db_session=None):
    """Return the next schedule window start as a timezone-aware UTC datetime.

    If the schedule start is later today, return today at start time.
    If we're past the window (or in an overnight gap), return tomorrow at start time.
    """
    from datetime import datetime as _dt, timedelta, timezone as _tz
    from zoneinfo import ZoneInfo
    from app.database import SessionLocal
    from app.models import AppSettings

    db = db_session or SessionLocal()
    try:
        start_row = db.query(AppSettings).filter(AppSettings.key == "schedule_start_hour").first()
        start_val = start_row.value if start_row and start_row.value else "08:00"

        try:
            start_h, start_m = map(int, start_val.split(":"))
        except (ValueError, AttributeError):
            return None

        tz_row = db.query(AppSettings).filter(AppSettings.key == "schedule_timezone").first()
        tz_name = tz_row.value if tz_row and tz_row.value else "Europe/Paris"
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Europe/Paris")

        now = _dt.now(_tz.utc).astimezone(tz)
        # Build today's start time in the configured timezone
        today_start = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)

        if now < today_start:
            # Start is later today
            return today_start.astimezone(_tz.utc)
        else:
            # Start is tomorrow
            return (today_start + timedelta(days=1)).astimezone(_tz.utc)
    except Exception:
        return None
    finally:
        if not db_session:
            db.close()


def get_global_actions_today(action_types: list, db_session=None) -> int:
    """Count today's successful actions across ALL campaigns."""
    from datetime import datetime as _dt, date as _date
    from sqlalchemy import func
    from app.database import SessionLocal
    from app.models import CampaignAction

    db = db_session or SessionLocal()
    try:
        today_start = _dt.combine(_date.today(), _dt.min.time())
        count = db.query(func.count(CampaignAction.id)).filter(
            CampaignAction.action_type.in_(action_types),
            CampaignAction.status == "success",
            CampaignAction.created_at >= today_start,
        ).scalar() or 0
        return count
    except Exception:
        return 0
    finally:
        if not db_session:
            db.close()


def get_effective_daily_limit(base_limit: int, db_session=None) -> int:
    """Apply warmup curve to the base daily limit if warmup is enabled."""
    from datetime import date as _date
    from app.database import SessionLocal
    from app.models import AppSettings

    db = db_session or SessionLocal()
    try:
        enabled_row = db.query(AppSettings).filter(AppSettings.key == "warmup_enabled").first()
        if not enabled_row or enabled_row.value.lower() != "true":
            return base_limit

        start_row = db.query(AppSettings).filter(AppSettings.key == "warmup_start_limit").first()
        target_row = db.query(AppSettings).filter(AppSettings.key == "warmup_target_limit").first()
        days_row = db.query(AppSettings).filter(AppSettings.key == "warmup_days").first()
        started_row = db.query(AppSettings).filter(AppSettings.key == "warmup_started_at").first()

        start_limit = int(start_row.value) if start_row else 5
        target_limit = int(target_row.value) if target_row else 25
        warmup_days = int(days_row.value) if days_row else 7

        if not started_row or not started_row.value:
            return base_limit

        started_at = _date.fromisoformat(started_row.value)
        elapsed = (_date.today() - started_at).days

        if elapsed >= warmup_days:
            return min(base_limit, target_limit)

        effective = start_limit + (target_limit - start_limit) * elapsed / warmup_days
        return min(base_limit, int(effective))
    except Exception:
        return base_limit
    finally:
        if not db_session:
            db.close()
