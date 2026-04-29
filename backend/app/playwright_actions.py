"""Playwright-based LinkedIn actions.

Used for actions LinkedIn has closed off behind their SDUI/protobuf system
and which therefore can't be done via raw HTTP calls anymore. Currently
just `reply_to_comment_via_browser`. Like, DM, connect, etc. still go
through the fast HTTP path in linkedin_service.py.
"""
from __future__ import annotations

import asyncio
import logging
import re
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

# How long to wait for LinkedIn elements to appear (slow on Render free tier)
DEFAULT_TIMEOUT_MS = 30000
# Navigations to LinkedIn post pages can be very slow (heavy SPA hydration).
NAV_TIMEOUT_MS = 60000


def _extract_activity_id(activity_urn: str) -> str:
    """Pull the numeric activity id out of any of the URN shapes we see."""
    m = re.search(r"(\d{15,})", activity_urn)
    if not m:
        raise ValueError(f"Cannot extract activity id from {activity_urn!r}")
    return m.group(1)


def _extract_comment_id(comment_urn: str) -> str:
    """Pull the numeric comment id out of any of the URN shapes."""
    # urn:li:fs_objectComment:(7453748376971522048,activity:7453340725...)
    # urn:li:fsd_comment:(7453748376971522048,urn:li:activity:7453340725...)
    # urn:li:comment:(activity:7453340725...,7453748376971522048)
    m = re.search(r"(\d{15,})", comment_urn)
    if not m:
        raise ValueError(f"Cannot extract comment id from {comment_urn!r}")
    return m.group(1)


@asynccontextmanager
async def _browser_context(li_at: str, jsessionid: str):
    """Yield a Playwright browser context with LinkedIn cookies pre-loaded."""
    from playwright.async_api import async_playwright

    csrf = jsessionid.strip('"')

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/145.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
                locale="fr-FR",
            )
            await context.add_cookies([
                {
                    "name": "li_at", "value": li_at,
                    "domain": ".linkedin.com", "path": "/",
                    "secure": True, "httpOnly": True, "sameSite": "None",
                },
                {
                    "name": "JSESSIONID", "value": f'"{csrf}"',
                    "domain": ".linkedin.com", "path": "/",
                    "secure": True, "httpOnly": False, "sameSite": "None",
                },
            ])
            yield context
        finally:
            await browser.close()


async def reply_to_comment_via_browser(
    li_at: str,
    jsessionid: str,
    activity_urn: str,
    parent_comment_urn: str,
    reply_text: str,
) -> bool:
    """Post a reply to a LinkedIn comment by driving a real Chromium.

    Returns True if the SDUI createComment request comes back with HTTP 200.
    Returns False otherwise (network failure, validation error, etc).
    """
    activity_id = _extract_activity_id(activity_urn)
    comment_id = _extract_comment_id(parent_comment_urn)

    # Plain post URL — adding ?commentUrn=... would make LinkedIn return a
    # different first-page set, sometimes _without_ the comment we want.
    # Better to load the default page and click "load more" until the target
    # appears.
    url = f"https://www.linkedin.com/feed/update/urn:li:activity:{activity_id}"

    async with _browser_context(li_at, jsessionid) as context:
        page = await context.new_page()
        page.set_default_timeout(DEFAULT_TIMEOUT_MS)
        page.set_default_navigation_timeout(NAV_TIMEOUT_MS)

        # Authoritative success signal: watch for LinkedIn's createComment
        # SDUI request. Anything else (DOM heuristics) gives false positives
        # on pages that already contain the reply text in another comment.
        sdui_status: dict[str, int | None] = {"status": None}

        async def on_response(response):
            try:
                # LinkedIn currently posts comments via voyagerSocialDashNormComments
                # (returns 201 Created on success). The older SDUI route is kept
                # as a fallback recognizer in case LinkedIn flips back.
                if (
                    "voyagerSocialDashNormComments" in response.url
                    or "sduiid=com.linkedin.sdui.comments.createComment" in response.url
                ):
                    if response.request.method in ("POST", "PUT"):
                        sdui_status["status"] = response.status
            except Exception:
                pass

        page.on("response", on_response)

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        except Exception:
            # LinkedIn pages sometimes never settle on domcontentloaded under
            # headless. Fall back to a "commit" wait — the response started,
            # the JS bundle will hydrate during the explicit waits below.
            logger.warning("reply_to_comment: domcontentloaded timed out, retrying with wait_until=commit")
            await page.goto(url, wait_until="commit", timeout=NAV_TIMEOUT_MS)

        # Hydration: LinkedIn does its real comment rendering after the SPA
        # boots. Give it time and trigger small scrolls so the comments
        # section enters the viewport (lazy-loaded otherwise).
        await page.wait_for_timeout(6000)
        await page.evaluate("window.scrollTo(0, 600)")
        await page.wait_for_timeout(2000)
        await page.evaluate("window.scrollTo(0, 1500)")
        await page.wait_for_timeout(3000)

        article_selector = f'article[data-id*="{comment_id}"]'
        # If the targeted comment isn't on the first page of comments, click
        # any "Charger les commentaires précédents" / "Load more" buttons
        # until we find it. Cap to avoid infinite loops.
        for _ in range(12):
            count = await page.locator(article_selector).count()
            if count:
                break
            load_more = page.locator(
                "button:has-text('Charger les commentaires précédents'), "
                "button:has-text('Load more comments'), "
                "button:has-text('Voir plus de commentaires'), "
                "button:has-text('Show more comments')"
            ).first
            if await load_more.count() == 0:
                break
            try:
                await load_more.click()
                await page.wait_for_timeout(1500)
            except Exception:
                break
        # state="attached" — the <article> exists in the DOM.
        try:
            await page.wait_for_selector(article_selector, state="attached",
                                         timeout=DEFAULT_TIMEOUT_MS)
        except Exception:
            try:
                ids_in_dom = await page.evaluate(
                    "() => Array.from(document.querySelectorAll('article[data-id]'))"
                    "  .map(a => a.getAttribute('data-id'))"
                )
                logger.warning(
                    "reply_to_comment: target comment %s not found in DOM "
                    "after load-more. Found %d articles. ids=%s",
                    comment_id, len(ids_in_dom), ids_in_dom[:20],
                )
            except Exception:
                pass
            raise

        comment_node = page.locator(article_selector).first
        await comment_node.scroll_into_view_if_needed()
        await page.wait_for_timeout(500)

        # Click the "Répondre" / "Reply" toggle button on this specific comment.
        reply_btn = comment_node.locator(
            "button:has-text('Répondre'), button:has-text('Reply')"
        ).first
        await reply_btn.click()

        # Composer textbox: nested inside the article's thread container.
        # Walk up two levels to encompass the comment + replies thread,
        # then locate the contenteditable that appeared after Reply click.
        thread_container = comment_node.locator("xpath=ancestor::*[2]").first
        textbox = thread_container.locator(
            "div[role='textbox'][contenteditable='true']"
        ).first
        await textbox.wait_for(state="visible", timeout=DEFAULT_TIMEOUT_MS)
        await textbox.click()
        await page.wait_for_timeout(300)
        # Type via the keyboard so LinkedIn's input handlers fire (they ignore
        # programmatic value writes on contenteditable).
        await page.keyboard.type(reply_text, delay=20)
        await page.wait_for_timeout(500)

        # The reply composer is the textbox's first ancestor that contains
        # multiple buttons. In observed LinkedIn FR DOM that's ancestor[6]
        # holding 3 buttons: emoji, image-upload, submit.
        # The submit button in the reply composer is labeled "Répondre"
        # (same text as the toggle button on each comment) — so scoping
        # strictly to the composer is essential to not grab the toggle.
        composer = None
        for n in range(1, 12):
            cand = textbox.locator(f"xpath=ancestor::*[{n}]").first
            try:
                btn_count = await cand.locator("button").count()
            except Exception:
                btn_count = 0
            if btn_count >= 2:
                composer = cand
                logger.info("Composer found at ancestor[%d] with %d buttons",
                            n, btn_count)
                break
        if composer is None:
            logger.warning("Playwright reply: could not locate composer.")
            return False

        submit_labels = {"Commenter", "Comment", "Publier", "Post",
                         "Envoyer", "Send", "Répondre", "Reply"}
        submit_btn = None
        for _ in range(60):
            btns = await composer.locator("button").all()
            for btn in btns:
                try:
                    if not (await btn.is_visible() and await btn.is_enabled()):
                        continue
                    txt = (await btn.inner_text(timeout=300)).strip()
                    if txt in submit_labels:
                        submit_btn = btn
                        break
                except Exception:
                    continue
            if submit_btn is not None:
                break
            await asyncio.sleep(0.2)

        if submit_btn is None:
            try:
                await page.screenshot(path="/tmp/lb_no_submit.png", full_page=True)
            except Exception:
                pass
            logger.warning("Playwright reply: no enabled submit button found.")
            return False

        try:
            await submit_btn.click()
        except Exception:
            logger.warning("submit_btn.click() raised; falling back to "
                           "Ctrl+Enter on textbox", exc_info=True)
            try:
                await textbox.click()
                await page.keyboard.press("Control+Enter")
            except Exception:
                logger.warning("Ctrl+Enter fallback failed", exc_info=True)

        # Wait until LinkedIn's createComment endpoint responds. Poll
        # every 200ms for up to 12 seconds. If it never fires, the submit
        # button click silently failed (locator pointed at the wrong button,
        # composer was already closed, etc.).
        for _ in range(60):
            if sdui_status["status"] is not None:
                break
            await asyncio.sleep(0.2)

        status = sdui_status["status"]
        if status is None:
            try:
                await page.screenshot(path="/tmp/lb_reply_no_request.png", full_page=True)
            except Exception:
                pass
            logger.warning(
                "Playwright reply: createComment request never fired. "
                "Screenshot at /tmp/lb_reply_no_request.png.")
            return False

        if status not in (200, 201):
            logger.warning(
                "Playwright reply: createComment returned HTTP %d for "
                "activity=%s comment=%s", status, activity_urn, parent_comment_urn)
            return False

        logger.info("Playwright reply: posted (HTTP %d) on %s under %s",
                    status, activity_urn, parent_comment_urn)
        return True
