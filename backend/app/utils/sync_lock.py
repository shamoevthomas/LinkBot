"""Simple in-memory lock to prevent import and sync from running simultaneously per user."""

import logging

logger = logging.getLogger(__name__)

_locks: dict[int, str] = {}


def acquire_lock(user_id: int, operation: str) -> bool:
    """Try to acquire the lock. Returns True if acquired, False if already locked."""
    if user_id in _locks:
        logger.info("Lock denied for user %d (%s): already locked by %s", user_id, operation, _locks[user_id])
        return False
    _locks[user_id] = operation
    return True


def release_lock(user_id: int):
    """Release the lock for a user."""
    _locks.pop(user_id, None)


def is_locked(user_id: int) -> str | None:
    """Check if a user is locked. Returns the operation name or None."""
    return _locks.get(user_id)
