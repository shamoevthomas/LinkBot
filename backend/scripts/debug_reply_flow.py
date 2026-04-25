"""Step-by-step debug of the reply flow. Dumps DOM at each stage."""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

LI_AT = os.environ["LI_AT"]
JSESSIONID = os.environ["JSESSIONID"]
ACTIVITY_ID = "7453340725200621568"
COMMENT_ID = "7453748376971522048"


async def buttons_inside(loc, label):
    """Print every button inside a locator."""
    btns = await loc.locator("button").all()
    print(f"\n  -- buttons inside {label} ({len(btns)}) --")
    for i, b in enumerate(btns[:30]):
        try:
            txt = (await b.inner_text(timeout=500)).strip().replace("\n", " ")
            visible = await b.is_visible()
            enabled = await b.is_enabled()
            print(f"  [{i}] visible={visible} enabled={enabled} text={txt!r}")
        except Exception as e:
            print(f"  [{i}] err: {e}")


async def main():
    csrf = JSESSIONID.strip('"')
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(
            user_agent=("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/145.0.0.0 Safari/537.36"),
            viewport={"width": 1280, "height": 900}, locale="fr-FR",
        )
        await context.add_cookies([
            {"name": "li_at", "value": LI_AT, "domain": ".linkedin.com",
             "path": "/", "secure": True, "httpOnly": True, "sameSite": "None"},
            {"name": "JSESSIONID", "value": f'"{csrf}"', "domain": ".linkedin.com",
             "path": "/", "secure": True, "httpOnly": False, "sameSite": "None"},
        ])
        page = await context.new_page()
        page.set_default_timeout(30000)

        sdui_calls = []

        def on_request(req):
            if "createComment" in req.url:
                sdui_calls.append(("REQ", req.url, req.method))

        async def on_response(resp):
            if "createComment" in resp.url:
                sdui_calls.append(("RESP", resp.url, resp.status))

        page.on("request", on_request)
        page.on("response", lambda r: asyncio.create_task(on_response(r)))

        url = f"https://www.linkedin.com/feed/update/urn:li:activity:{ACTIVITY_ID}"
        print(f"=== Step 1: Navigate to {url} ===")
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(8000)
        await page.evaluate("window.scrollTo(0, 1500)")
        await page.wait_for_timeout(3000)

        article_sel = f'article[data-id*="{COMMENT_ID}"]'
        article = page.locator(article_sel).first
        n = await article.count()
        print(f"\n=== Step 2: Find target comment article ===")
        print(f"  Articles matching {article_sel!r}: {n}")
        if n == 0:
            print("  -> not in DOM, aborting")
            await browser.close()
            return

        await article.scroll_into_view_if_needed()
        await page.wait_for_timeout(1000)

        # Dump buttons inside the article
        await buttons_inside(article, "the target article")

        print("\n=== Step 3: Click 'Répondre' inside the article ===")
        reply_btn = article.locator("button:has-text('Répondre'), button:has-text('Reply')").first
        await reply_btn.click()
        await page.wait_for_timeout(2000)

        # The composer appears as a sibling. Try multiple xpath levels.
        for n_levels in (1, 2, 3, 4, 5, 6):
            container = article.locator(f"xpath=ancestor::*[{n_levels}]").first
            tb_count = await container.locator("div[role='textbox'][contenteditable='true']").count()
            btn_count = await container.locator("button").count()
            print(f"  ancestor[{n_levels}]: textboxes={tb_count} buttons={btn_count}")

        # Find the textbox at any ancestor level
        print("\n=== Step 4: Locate composer textbox ===")
        tb = article.locator(
            "xpath=following::div[@role='textbox' and @contenteditable='true']"
        ).first
        tb_count = await tb.count()
        print(f"  Textbox via following:: count={tb_count}")
        if tb_count == 0:
            tb = page.locator("div[role='textbox'][contenteditable='true']").first
            print(f"  Falling back to page-level: count={await tb.count()}")

        if await tb.count():
            await tb.click()
            await page.keyboard.type("merci", delay=30)
            await page.wait_for_timeout(500)
            print("  Typed 'merci'")

        # After typing, look for the submit button. Strategy: find the
        # composer parent of the textbox, then enumerate its buttons.
        print("\n=== Step 5: Find submit button ===")
        # Climb from textbox up looking for a form / role=group / div with
        # multiple buttons (cancel + post).
        for n_levels in range(1, 10):
            anc = tb.locator(f"xpath=ancestor::*[{n_levels}]").first
            btn_count = await anc.locator("button").count()
            if btn_count >= 2:
                print(f"  Composer at ancestor[{n_levels}]: {btn_count} buttons")
                btns = await anc.locator("button").all()
                for i, b in enumerate(btns):
                    try:
                        txt = (await b.inner_text(timeout=300)).strip().replace("\n", " ")
                        en = await b.is_enabled()
                        vis = await b.is_visible()
                        print(f"    [{i}] visible={vis} enabled={en} text={txt!r}")
                    except Exception:
                        pass
                break

        await page.screenshot(path="/tmp/lb_debug_after_type.png", full_page=True)
        print("  Screenshot saved: /tmp/lb_debug_after_type.png")

        print(f"\n=== SDUI requests so far: {sdui_calls}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
