"""
APScheduler integration for running campaign jobs on intervals.

Uses ``AsyncIOScheduler`` so jobs are dispatched on the FastAPI event loop.
Each campaign gets its own interval job whose period is derived from
``(spread_over_days * 86400) / total_target``, clamped to [30, 3600] seconds.
"""

import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.memory import MemoryJobStore

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def init_scheduler() -> AsyncIOScheduler:
    """Create and start the global scheduler.  Safe to call multiple times."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = AsyncIOScheduler(
        jobstores={"default": MemoryJobStore()},
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 120},
    )
    _scheduler.start()
    logger.info("APScheduler started")

    # Register CRON job: sync new connections every 6 hours
    _schedule_sync_connections()

    return _scheduler


def _schedule_sync_connections() -> None:
    """Register the periodic connection sync job (every 6 hours)
    and run once at startup after a short delay."""
    from app.jobs.sync_connections import sync_new_connections

    # Recurring every 6 hours
    _scheduler.add_job(
        sync_new_connections,
        trigger=CronTrigger(hour="*/6"),
        id="sync_connections",
        replace_existing=True,
    )

    # Run once 30s after startup to catch up on missed connections
    from datetime import datetime, timedelta
    _scheduler.add_job(
        sync_new_connections,
        trigger="date",
        run_date=datetime.now() + timedelta(seconds=30),
        id="sync_connections_startup",
        replace_existing=True,
    )
    logger.info("Scheduled sync_connections CRON (every 6h) + startup run")


def get_scheduler() -> AsyncIOScheduler:
    """Return the running scheduler instance, creating it if necessary."""
    if _scheduler is None:
        return init_scheduler()
    return _scheduler


def shutdown_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down")
        _scheduler = None


# ---------------------------------------------------------------------------
# Interval calculation
# ---------------------------------------------------------------------------

def _calculate_interval_seconds(total_target: int, spread_over_days: int) -> int:
    """Return the interval between job executions in seconds.

    Formula: ``(spread_over_days * 86400) / total_target``, clamped to
    the range [30, 3600].
    """
    if total_target <= 0 or spread_over_days <= 0:
        return 60  # sensible default

    raw = (spread_over_days * 86400) / total_target
    return max(30, min(3600, int(raw)))


# ---------------------------------------------------------------------------
# Campaign job management
# ---------------------------------------------------------------------------

def _job_id(campaign_id: int) -> str:
    return f"campaign_{campaign_id}"


def schedule_campaign_job(
    campaign_id: int,
    campaign_type: str,
    total_target: int,
    spread_over_days: int,
    interval_seconds: Optional[int] = None,
) -> None:
    """Register (or replace) an interval job for the given campaign.

    The correct runner function is selected based on *campaign_type*
    (``"search"``, ``"dm"``, or ``"connection"``).
    """
    scheduler = get_scheduler()
    job_id = _job_id(campaign_id)

    # Remove any existing job for this campaign.
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    # Use global delay_between_actions setting if no explicit interval
    if not interval_seconds:
        from app.database import SessionLocal
        from app.models import AppSettings
        db = SessionLocal()
        try:
            row = db.query(AppSettings).filter(AppSettings.key == "delay_between_actions").first()
            if row:
                interval_seconds = int(row.value) * 60  # minutes -> seconds
        finally:
            db.close()

    interval = interval_seconds or _calculate_interval_seconds(total_target, spread_over_days)

    # Import runners lazily to avoid circular imports.
    if campaign_type == "search":
        from app.jobs.search_campaign import run_search_campaign as runner
    elif campaign_type == "dm":
        from app.jobs.dm_campaign import run_dm_campaign as runner
    elif campaign_type == "connection":
        from app.jobs.connection_campaign import run_connection_campaign as runner
    elif campaign_type == "connection_dm":
        from app.jobs.connection_dm_campaign import run_connection_dm_campaign as runner
    else:
        logger.error("Unknown campaign type: %s", campaign_type)
        return

    scheduler.add_job(
        runner,
        trigger=IntervalTrigger(seconds=interval, jitter=max(10, int(interval * 0.3))),
        id=job_id,
        args=[campaign_id],
        replace_existing=True,
    )
    logger.info(
        "Scheduled campaign %d (%s) every %d s", campaign_id, campaign_type, interval
    )


def pause_campaign_job(campaign_id: int) -> None:
    """Pause the job for the given campaign (does not remove it)."""
    scheduler = get_scheduler()
    job_id = _job_id(campaign_id)
    job = scheduler.get_job(job_id)
    if job:
        job.pause()
        logger.info("Paused campaign job %s", job_id)


def resume_campaign_job(campaign_id: int) -> None:
    """Resume a previously paused campaign job."""
    scheduler = get_scheduler()
    job_id = _job_id(campaign_id)
    job = scheduler.get_job(job_id)
    if job:
        job.resume()
        logger.info("Resumed campaign job %s", job_id)


def cancel_campaign_job(campaign_id: int) -> None:
    """Remove the job for the given campaign entirely."""
    scheduler = get_scheduler()
    job_id = _job_id(campaign_id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("Cancelled campaign job %s", job_id)


# ---------------------------------------------------------------------------
# Schedule window helpers
# ---------------------------------------------------------------------------

def is_within_schedule(db_session=None) -> bool:
    """Check if the current time is within the configured schedule window.

    Returns True (allowed) if no schedule is configured.
    """
    from datetime import datetime
    from app.database import SessionLocal
    from app.models import AppSettings

    db = db_session or SessionLocal()
    try:
        start_row = db.query(AppSettings).filter(AppSettings.key == "schedule_start_hour").first()
        end_row = db.query(AppSettings).filter(AppSettings.key == "schedule_end_hour").first()

        if not start_row or not end_row:
            return True

        try:
            start_h, start_m = map(int, start_row.value.split(":"))
            end_h, end_m = map(int, end_row.value.split(":"))
        except (ValueError, AttributeError):
            return True

        now = datetime.now()
        current_minutes = now.hour * 60 + now.minute
        start_minutes = start_h * 60 + start_m
        end_minutes = end_h * 60 + end_m

        if start_minutes <= end_minutes:
            return start_minutes <= current_minutes < end_minutes
        else:
            # Overnight window (e.g. 22:00 -> 06:00)
            return current_minutes >= start_minutes or current_minutes < end_minutes
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
