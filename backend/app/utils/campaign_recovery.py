"""Restart campaigns that a LinkedIn session outage stopped.

Used from two places: the endpoint that saves fresh cookies, and the periodic
validator when it finds a session working again. Without the second, an outage
that healed on LinkedIn's side left every campaign paused until the user
noticed and restarted each one by hand.
"""

import logging
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Wording the job runners use when a dead session stops a campaign, past and
# present. Only campaigns carrying one of these are resumed — anything paused
# deliberately must stay paused.
COOKIE_STOP_MARKERS = ("No valid LinkedIn cookies", "Cookies LinkedIn invalides")


def resume_cookie_stopped_campaigns(db: Session, user_id: int) -> int:
    """Bring back campaigns stopped by a cookie/session problem. Returns count."""
    from app.models import Campaign
    from app.scheduler import _campaigns, schedule_campaign_job, resume_campaign_job

    stopped = (
        db.query(Campaign)
        .filter(Campaign.user_id == user_id, Campaign.status.in_(("paused", "failed")))
        .all()
    )
    resumed = 0
    for c in stopped:
        msg = c.error_message or ""
        if not any(marker in msg for marker in COOKIE_STOP_MARKERS):
            continue
        c.status = "running"
        c.error_message = None
        resumed += 1
        try:
            if c.id not in _campaigns:
                schedule_campaign_job(c.id, c.type)
            else:
                resume_campaign_job(c.id)
        except Exception:
            logger.exception("Could not re-register campaign %s after session recovery", c.id)
    if resumed:
        db.commit()
    return resumed
