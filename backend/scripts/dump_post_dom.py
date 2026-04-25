"""Open the post page with Playwright and dump useful DOM info to figure out
what selectors work for finding the comment + clicking Reply."""
import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from playwright.async_api import async_playwright

LI_AT = os.environ["LI_AT"]
JSESSIONID = os.environ["JSESSIONID"]
ACTIVITY_ID = "7453340725200621568"
COMMENT_ID = "7453748376971522048"

URL = (
    f"https://www.linkedin.com/feed/update/urn:li:activity:{ACTIVITY_ID}"
    f"?commentUrn=urn%3Ali%3Acomment%3A%28activity%3A{ACTIVITY_ID}"
    f"%2C{COMMENT_ID}%29"
)


async def main():
    csrf = JSESSIONID.strip('"')
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context(
            user_agent=("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/145.0.0.0 Safari/537.36"),
            viewport={"width": 1280, "height": 900},
            locale="fr-FR",
        )
        await context.add_cookies([
            {"name": "li_at", "value": LI_AT, "domain": ".linkedin.com",
             "path": "/", "secure": True, "httpOnly": True, "sameSite": "None"},
            {"name": "JSESSIONID", "value": f'"{csrf}"', "domain": ".linkedin.com",
             "path": "/", "secure": True, "httpOnly": False, "sameSite": "None"},
        ])
        page = await context.new_page()
        page.set_default_timeout(30000)
        await page.goto(URL, wait_until="domcontentloaded")

        # Wait a bit for hydration
        await page.wait_for_timeout(8000)

        # Try to scroll into the comment area (LinkedIn lazy-loads comments)
        await page.evaluate("window.scrollTo(0, 600)")
        await page.wait_for_timeout(2000)
        await page.evaluate("window.scrollTo(0, 1200)")
        await page.wait_for_timeout(2000)

        await page.screenshot(path="/tmp/lb_post.png", full_page=True)
        html = await page.content()

        print(f"Page title: {await page.title()}")
        print(f"URL: {page.url}")
        print(f"HTML size: {len(html)}")

        # Look for the comment id
        hits = list(re.finditer(rf"({COMMENT_ID})", html))
        print(f"Occurrences of comment id {COMMENT_ID}: {len(hits)}")
        if hits:
            # Show 100 chars of context around the first 3
            for h in hits[:3]:
                s = max(0, h.start()-100)
                e = min(len(html), h.end()+100)
                print(f"  ...{html[s:e]!r}...")

        # Find any data-id attribute around the comment
        for m in re.finditer(r'data-id=["\']([^"\']*' + COMMENT_ID + r'[^"\']*)["\']', html):
            print(f"data-id match: {m.group(1)}")

        # Print all 'Répondre' buttons
        buttons = await page.locator("button").all()
        print(f"\nTotal buttons on page: {len(buttons)}")
        labels = []
        for b in buttons[:200]:
            try:
                t = (await b.inner_text(timeout=500)).strip()
                if t and len(t) < 40:
                    labels.append(t)
            except Exception:
                pass
        from collections import Counter
        print("Top button labels:")
        for label, count in Counter(labels).most_common(20):
            print(f"  {count:3} × {label!r}")

        # See if there's a dialog about consent
        for sel in ['button[aria-label*="Accept"]', 'button[aria-label*="Accepter"]']:
            n = await page.locator(sel).count()
            if n:
                print(f"Found consent button: {sel} (count={n})")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
