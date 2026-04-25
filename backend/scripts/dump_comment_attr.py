"""Find what DOM attribute LinkedIn uses to anchor a specific comment."""
import asyncio
import os
import re
import sys

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
            viewport={"width": 1280, "height": 900}, locale="fr-FR",
        )
        await context.add_cookies([
            {"name": "li_at", "value": LI_AT, "domain": ".linkedin.com",
             "path": "/", "secure": True, "httpOnly": True, "sameSite": "None"},
            {"name": "JSESSIONID", "value": f'"{csrf}"', "domain": ".linkedin.com",
             "path": "/", "secure": True, "httpOnly": False, "sameSite": "None"},
        ])
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_timeout(6000)
        await page.evaluate("window.scrollTo(0, 1500)")
        await page.wait_for_timeout(3000)

        # Use evaluate() to find any element whose attributes contain the
        # comment id, and report its tag + attrs
        result = await page.evaluate("""(commentId) => {
            const all = document.querySelectorAll('*');
            const matches = [];
            for (const el of all) {
                for (const a of el.attributes) {
                    if (a.value && a.value.includes(commentId)) {
                        matches.push({
                            tag: el.tagName.toLowerCase(),
                            attr: a.name,
                            value: a.value.length > 200 ? a.value.slice(0, 200) + '…' : a.value,
                            classes: (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : '',
                        });
                        break;
                    }
                }
            }
            return matches;
        }""", COMMENT_ID)

        print(f"DOM elements with attribute containing the comment id ({len(result)}):")
        seen = set()
        for r in result:
            key = (r['tag'], r['attr'])
            if key in seen:
                continue
            seen.add(key)
            print(f"  <{r['tag']} {r['attr']}={r['value']!r}> classes={r['classes']!r}")

        # Also look for data-urn
        urn_attrs = await page.evaluate("""() => {
            const all = document.querySelectorAll('[data-urn], [data-id]');
            const samples = [];
            for (const el of all) {
                samples.push({
                    tag: el.tagName.toLowerCase(),
                    'data-urn': el.getAttribute('data-urn'),
                    'data-id': el.getAttribute('data-id'),
                });
                if (samples.length >= 30) break;
            }
            return samples;
        }""")
        print(f"\nFirst 30 elements with data-urn/data-id:")
        for s in urn_attrs:
            print(f"  {s}")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
