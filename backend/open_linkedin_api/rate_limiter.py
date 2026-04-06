"""
Rate limiter for LinkedIn API requests.

Implements intelligent rate limiting to mimic human behavior and avoid
being flagged by LinkedIn's anti-bot detection systems.
"""

import time
import random
import logging
from collections import deque
from threading import Lock
from typing import Optional, Dict, Deque

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Rate limiter using sliding window algorithm to control request frequency.

    This helps mimic human browsing behavior by:
    - Enforcing minimum delays between requests
    - Adding random jitter to make timing less predictable
    - Tracking request history to prevent bursts
    - Using configurable limits for different usage patterns
    """

    # Constants for rate limiting behavior
    WINDOW_SIZE_SECONDS = 60.0  # 1 minute window for rate limiting
    BURST_DETECTION_WINDOW_SECONDS = 10.0  # Time window for burst detection
    FIRST_REQUEST_DELAY_MULTIPLIER = 0.5  # Multiplier for first request delay
    BURST_JITTER_MULTIPLIER = 0.5  # Multiplier for burst jitter
    NORMAL_JITTER_MIN = -0.5  # Minimum jitter for normal requests
    NORMAL_JITTER_MAX = 1.5  # Maximum jitter for normal requests

    def __init__(
        self,
        requests_per_minute: int = 10,
        min_delay_seconds: float = 3.0,
        max_delay_seconds: float = 8.0,
        burst_size: int = 3,
    ):
        """
        Initialize the rate limiter.

        :param requests_per_minute: Maximum requests allowed per minute
        :param min_delay_seconds: Minimum delay between requests
        :param max_delay_seconds: Maximum delay between requests
        :param burst_size: Number of requests allowed in quick succession
        """
        self.requests_per_minute = requests_per_minute
        self.min_delay = min_delay_seconds
        self.max_delay = max_delay_seconds
        self.burst_size = burst_size

        # Track request timestamps
        self.request_times: Deque[float] = deque()
        self.last_request_time: Optional[float] = None
        self.lock = Lock()

        logger.info(
            f"Rate limiter initialized: {requests_per_minute} req/min, "
            f"delay: {min_delay_seconds}-{max_delay_seconds}s, burst: {burst_size}"
        )

    def wait(self) -> float:
        """
        Wait before making the next request to comply with rate limits.

        Returns the actual delay time in seconds.
        """
        with self.lock:
            current_time = time.time()

            # Clean up old request times outside the window
            self._cleanup_old_requests(current_time)

            # Calculate delay based on last request
            delay = self._calculate_delay(current_time)

            # Check if we've exceeded the rate limit
            delay = self._enforce_rate_limit(current_time, delay)

            # Apply the delay
            self._apply_delay(delay)

            # Record this request
            actual_time = time.time()
            self.request_times.append(actual_time)
            self.last_request_time = actual_time

            return delay

    def _cleanup_old_requests(self, current_time: float) -> None:
        """Remove request timestamps outside the sliding window."""
        while (
            self.request_times
            and current_time - self.request_times[0] > self.WINDOW_SIZE_SECONDS
        ):
            self.request_times.popleft()

    def _count_recent_requests(self, current_time: float, window_seconds: float) -> int:
        """
        Count requests within a specific time window.

        :param current_time: Current timestamp
        :param window_seconds: Size of the time window in seconds
        :return: Number of requests in the window
        """
        return sum(1 for t in self.request_times if current_time - t < window_seconds)

    def _enforce_rate_limit(self, current_time: float, base_delay: float) -> float:
        """
        Enforce the maximum requests per minute limit.

        :param current_time: Current timestamp
        :param base_delay: The calculated base delay
        :return: Adjusted delay if rate limit is exceeded
        """
        if len(self.request_times) >= self.requests_per_minute:
            oldest_request = self.request_times[0]
            time_to_wait = self.WINDOW_SIZE_SECONDS - (current_time - oldest_request)
            if time_to_wait > 0:
                logger.warning(
                    f"Rate limit reached. Waiting {time_to_wait:.2f}s before next request"
                )
                return max(base_delay, time_to_wait)
        return base_delay

    def _apply_delay(self, delay: float) -> None:
        """Apply the calculated delay by sleeping."""
        if delay > 0:
            logger.debug(f"Rate limiter: sleeping for {delay:.2f} seconds")
            time.sleep(delay)

    def _calculate_delay(self, current_time: float) -> float:
        """
        Calculate the delay needed before the next request.

        Uses a combination of:
        - Minimum delay enforcement
        - Random jitter for human-like behavior
        - Burst detection
        """
        if self.last_request_time is None:
            return self._calculate_first_request_delay()

        time_since_last = current_time - self.last_request_time
        recent_requests = self._count_recent_requests(
            current_time, self.BURST_DETECTION_WINDOW_SECONDS
        )

        if self._is_burst_detected(recent_requests):
            base_delay, jitter = self._calculate_burst_delay()
        else:
            base_delay, jitter = self._calculate_normal_delay()

        # Ensure minimum delay is respected
        needed_delay = max(0, self.min_delay - time_since_last)
        total_delay = max(needed_delay, base_delay + jitter)

        return total_delay

    def _calculate_first_request_delay(self) -> float:
        """Calculate delay for the first request."""
        return random.uniform(
            self.min_delay * self.FIRST_REQUEST_DELAY_MULTIPLIER, self.min_delay
        )

    def _is_burst_detected(self, recent_requests: int) -> bool:
        """Check if burst behavior is detected."""
        return recent_requests >= self.burst_size

    def _calculate_burst_delay(self) -> tuple[float, float]:
        """
        Calculate delay components for burst situations.

        :return: Tuple of (base_delay, jitter)
        """
        base_delay = self.max_delay
        jitter = random.uniform(0, self.max_delay * self.BURST_JITTER_MULTIPLIER)
        logger.debug("Burst detected. Applying longer delay")
        return base_delay, jitter

    def _calculate_normal_delay(self) -> tuple[float, float]:
        """
        Calculate delay components for normal operation.

        :return: Tuple of (base_delay, jitter)
        """
        base_delay = random.uniform(self.min_delay, self.max_delay)
        jitter = random.uniform(self.NORMAL_JITTER_MIN, self.NORMAL_JITTER_MAX)
        return base_delay, jitter

    def reset(self) -> None:
        """Reset the rate limiter state."""
        with self.lock:
            self.request_times.clear()
            self.last_request_time = None
            logger.info("Rate limiter reset")

    def get_stats(self) -> Dict[str, Optional[float]]:
        """Get current rate limiter statistics."""
        with self.lock:
            current_time = time.time()
            recent_requests = self._count_recent_requests(
                current_time, self.WINDOW_SIZE_SECONDS
            )
            return {
                "requests_in_last_minute": recent_requests,
                "max_requests_per_minute": self.requests_per_minute,
                "last_request_ago": (
                    current_time - self.last_request_time
                    if self.last_request_time
                    else None
                ),
                "min_delay": self.min_delay,
                "max_delay": self.max_delay,
            }
