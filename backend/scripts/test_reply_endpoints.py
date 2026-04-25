#!/usr/bin/env python3
"""Test multiple LinkedIn endpoint variants to find one that posts a comment reply.

Usage:
    cd backend
    LI_AT='AQEDA...' JSESSIONID='ajax:0842...' python3 scripts/test_reply_endpoints.py

Then look for ">>>> SUCCESS <<<<" in the output.

After testing, rotate your LinkedIn cookies (logout/login) since they were
shared in this chat earlier.
"""
import json
import os
import re
import sys
import urllib.parse

import requests

LI_AT = os.environ.get("LI_AT")
JSESSIONID = os.environ.get("JSESSIONID")
if not LI_AT or not JSESSIONID:
    sys.exit("Set LI_AT and JSESSIONID env vars first.")

# Test target — the comment the user wants to reply to
ACTIVITY_ID = "7453340725200621568"
PARENT_COMMENT_ID = "7453748376971522048"
ACTIVITY_URN = f"urn:li:activity:{ACTIVITY_ID}"
PARENT_COMMENT_URN_FS = f"urn:li:fs_objectComment:({PARENT_COMMENT_ID},activity:{ACTIVITY_ID})"
PARENT_COMMENT_URN_FSD = f"urn:li:fsd_comment:({PARENT_COMMENT_ID},urn:li:activity:{ACTIVITY_ID})"
PARENT_COMMENT_URN_PLAIN = f"urn:li:comment:(activity:{ACTIVITY_ID},{PARENT_COMMENT_ID})"
REPLY_TEXT = "merci"

CSRF = JSESSIONID.strip('"')
COOKIE = f'li_at={LI_AT}; JSESSIONID="{CSRF}"'

WEB_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)
IOS_UA = "LinkedIn/9.28.2123 CFNetwork/1474.0.4 Darwin/23.1.0"

WEB_HEADERS = {
    "User-Agent": WEB_UA,
    "Cookie": COOKIE,
    "csrf-token": f"ajax:{CSRF.split(':',1)[1]}" if ":" in CSRF else CSRF,
    "x-restli-protocol-version": "2.0.0",
    "x-li-lang": "en_US",
    "Origin": "https://www.linkedin.com",
    "Referer": f"https://www.linkedin.com/feed/update/urn:li:activity:{ACTIVITY_ID}",
}
# csrf-token is just the JSESSIONID value (with the ajax: prefix kept)
WEB_HEADERS["csrf-token"] = CSRF

IOS_HEADERS = {
    **WEB_HEADERS,
    "User-Agent": IOS_UA,
    "X-Li-User-Agent": "LIAuthLibrary:0.0.3 com.linkedin.LinkedIn:9.28.2123 iPhone:17.1.0",
    "x-li-track": (
        '{"clientVersion":"9.28.2123","mpVersion":"9.28.2123","osName":"iOS",'
        '"osVersion":"17.1.0","deviceModel":"iPhone15,3","deviceType":"iphone",'
        '"appId":"com.linkedin.LinkedIn"}'
    ),
}


def try_endpoint(name, method, url, headers, body=None, expect_json=True):
    print(f"\n=== {name} ===")
    print(f"{method} {url}")
    try:
        resp = requests.request(method, url, headers=headers, data=body, timeout=20)
        print(f"  Status: {resp.status_code}")
        snippet = resp.text[:400].replace("\n", " ")
        print(f"  Body:   {snippet}")
        # Heuristic: 200/201 + body that doesn't look like an error
        if resp.status_code in (200, 201):
            try:
                j = resp.json() if expect_json else None
                if j and isinstance(j, dict) and j.get("status") and j["status"] >= 400:
                    print("  (looks like an error envelope, not real success)")
                    return False
            except Exception:
                pass
            print("  >>>> SUCCESS <<<<")
            return True
    except Exception as e:
        print(f"  ERROR: {e}")
    return False


# ============================================================
# Candidate 1: classic /feed/comments (web UA + ?action=create)
# ============================================================
url = "https://www.linkedin.com/voyager/api/feed/comments?action=create"
payload = {
    "updateId": f"activity:{ACTIVITY_ID}",
    "parentComment": PARENT_COMMENT_URN_FS,
    "commentary": {"text": REPLY_TEXT},
}
hdrs = {**WEB_HEADERS, "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/vnd.linkedin.normalized+json+2.1"}
try_endpoint("C1: /feed/comments?action=create web UA", "POST", url, hdrs, json.dumps(payload))

# ============================================================
# Candidate 1b: /feed/comments without ?action — the existing path that 500s
# ============================================================
url = "https://www.linkedin.com/voyager/api/feed/comments"
try_endpoint("C1b: /feed/comments (no action) web UA", "POST", url, hdrs, json.dumps(payload))

# ============================================================
# Candidate 1c: /feed/comments + iOS UA (existing workaround)
# ============================================================
ios_hdrs = {**IOS_HEADERS, "Content-Type": "application/json; charset=UTF-8",
            "Accept": "application/vnd.linkedin.normalized+json+2.1"}
try_endpoint("C1c: /feed/comments iOS UA", "POST", url, ios_hdrs, json.dumps(payload))

# ============================================================
# Candidate 2: /contentcreation/normComments
# ============================================================
url = "https://www.linkedin.com/voyager/api/contentcreation/normComments?action=createComment"
try_endpoint("C2: /contentcreation/normComments", "POST", url, hdrs, json.dumps(payload))

# ============================================================
# Candidate 3: /social/normComments
# ============================================================
url = "https://www.linkedin.com/voyager/api/social/normComments"
try_endpoint("C3: /social/normComments", "POST", url, hdrs, json.dumps(payload))

# ============================================================
# Candidate 4: voyager GraphQL — discover queryId from page bundle
# ============================================================
print("\n=== Discovering GraphQL queryIds from the LinkedIn web bundle ===")
post_url = f"https://www.linkedin.com/feed/update/urn:li:activity:{ACTIVITY_ID}"
try:
    resp = requests.get(post_url, headers={
        **WEB_HEADERS,
        "Accept": "text/html,application/xhtml+xml",
    }, timeout=20)
    print(f"  Page status: {resp.status_code}")
    bundle_urls = set(re.findall(r"https://static\.licdn\.com/[^\s\"']+\.js", resp.text))
    print(f"  Found {len(bundle_urls)} JS bundles linked in HTML")
    query_ids = set()
    # Direct hits in HTML
    query_ids.update(re.findall(r"voyagerSocialDashComments\.[a-f0-9]+", resp.text))
    # Scan a few bundles
    scanned = 0
    for b in list(bundle_urls):
        if scanned >= 10:
            break
        if "comment" not in b.lower() and "feed" not in b.lower() and "social" not in b.lower():
            continue
        try:
            r2 = requests.get(b, timeout=20)
            scanned += 1
            query_ids.update(re.findall(r"voyagerSocialDashComments\.[a-f0-9]+", r2.text))
            query_ids.update(re.findall(r"voyagerFeedDash[A-Za-z]+\.[a-f0-9]+", r2.text))
        except Exception:
            pass
    print(f"  Scanned {scanned} bundles. Found queryIds: {sorted(query_ids)[:8] if query_ids else 'NONE'}")
except Exception as e:
    print(f"  Discovery failed: {e}")
    query_ids = set()

# Try the most likely create-comment queryIds
for query_id in sorted(query_ids):
    if "Comment" not in query_id:
        continue
    url = f"https://www.linkedin.com/voyager/api/graphql?action=execute&queryId={query_id}"
    # rest.li-style URL-encoded variables
    variables = (
        f"(threadUrn:{urllib.parse.quote(ACTIVITY_URN, safe='')},"
        f"commentText:(text:{REPLY_TEXT},attributes:List()))"
    )
    gql_hdrs = {
        **WEB_HEADERS,
        "Accept": "application/graphql",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    }
    try_endpoint(f"C4: GraphQL {query_id}", "POST", url, gql_hdrs, f"variables={variables}")

# ============================================================
# Candidate 5: socialDashComments collection-level POST
# ============================================================
url = "https://www.linkedin.com/voyager/api/voyagerSocialDashComments?action=create"
try_endpoint("C5: voyagerSocialDashComments?action=create", "POST", url, hdrs, json.dumps({
    "thread": ACTIVITY_URN,
    "parentComment": PARENT_COMMENT_URN_FSD,
    "commentary": {"text": REPLY_TEXT, "attributes": []},
}))

# ============================================================
# Candidate 6: socialDashComments rest.li action-route
# ============================================================
url = (
    "https://www.linkedin.com/voyager/api/voyagerSocialDashComments?action=createComment"
    f"&threadUrn={urllib.parse.quote(ACTIVITY_URN)}"
)
try_endpoint("C6: voyagerSocialDashComments?action=createComment", "POST", url, hdrs,
             json.dumps({"commentary": {"text": REPLY_TEXT, "attributes": []},
                         "parentComment": PARENT_COMMENT_URN_FSD}))

# ============================================================
# Candidate 7: feed comments via the realtime/web SPA endpoint
# ============================================================
url = (
    "https://www.linkedin.com/voyager/api/feed/comments?action=create"
    f"&_q=parent&parentComment={urllib.parse.quote(PARENT_COMMENT_URN_FS)}"
    f"&updateId={urllib.parse.quote('activity:' + ACTIVITY_ID)}"
)
try_endpoint("C7: /feed/comments + parent in querystring", "POST", url, hdrs,
             json.dumps({"commentary": {"text": REPLY_TEXT}}))

print("\n\nDone. If anything showed >>>> SUCCESS <<<< — that's your endpoint.")
print("⚠️  Rotate your LinkedIn cookies now (logout/login on linkedin.com)")
print("    since they were shared earlier in this chat.")
