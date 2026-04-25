"""Smoke test for the Playwright-based reply_to_comment.

Usage:
    cd backend
    LI_AT='AQEDA...' JSESSIONID='ajax:0842...' python3 scripts/test_playwright_reply.py
"""
import asyncio
import os
import sys

# Ensure 'app' is importable when running from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.playwright_actions import reply_to_comment_via_browser

LI_AT = os.environ["LI_AT"]
JSESSIONID = os.environ["JSESSIONID"]

ACTIVITY_URN = "urn:li:activity:7453340725200621568"
# Comment "VIRAL" by Thomas Shamoev on his own post — the one the user
# wants the bot to reply "merci" under.
PARENT_COMMENT_URN = "urn:li:fs_objectComment:(7453748376971522048,activity:7453340725200621568)"
REPLY_TEXT = "merci"


async def main():
    print(f"Replying '{REPLY_TEXT}' to {PARENT_COMMENT_URN}")
    ok = await reply_to_comment_via_browser(
        li_at=LI_AT,
        jsessionid=JSESSIONID,
        activity_urn=ACTIVITY_URN,
        parent_comment_urn=PARENT_COMMENT_URN,
        reply_text=REPLY_TEXT,
    )
    print(f"Result: {'SUCCESS' if ok else 'FAILED'}")


if __name__ == "__main__":
    asyncio.run(main())
