"""Extract LinkedIn activity URN from various post URL formats."""

import re


def extract_activity_urn(url_or_urn: str) -> str | None:
    """Extract the numeric activity ID from a LinkedIn post URL or URN.

    Handles:
    - https://www.linkedin.com/posts/username_activity-7654321-xxxx
    - https://www.linkedin.com/feed/update/urn:li:activity:7654321
    - https://www.linkedin.com/feed/update/urn:li:ugcPost:7654321
    - urn:li:activity:7654321
    - 7654321 (passthrough)

    Returns the numeric activity ID string, or None if no match.
    """
    s = url_or_urn.strip()

    # Direct numeric ID
    if re.fullmatch(r"\d+", s):
        return s

    # urn:li:activity:123 or urn:li:ugcPost:123
    m = re.search(r"urn:li:(?:activity|ugcPost):(\d+)", s)
    if m:
        return m.group(1)

    # linkedin.com/posts/..._activity-123-...
    m = re.search(r"activity[_-](\d+)", s)
    if m:
        return m.group(1)

    # linkedin.com/feed/update/... (already caught by urn pattern above, but just in case)
    m = re.search(r"/feed/update/.*?(\d{10,})", s)
    if m:
        return m.group(1)

    return None
