#!/usr/bin/env python3
"""V2: focus on C1 (/feed/comments?action=create) — try many payload shapes,
plus better queryId discovery for the GraphQL path."""
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

ACTIVITY_ID = "7453340725200621568"
PARENT_COMMENT_ID = "7453748376971522048"
ACTIVITY_URN = f"urn:li:activity:{ACTIVITY_ID}"
URN_FS = f"urn:li:fs_objectComment:({PARENT_COMMENT_ID},activity:{ACTIVITY_ID})"
URN_FSD = f"urn:li:fsd_comment:({PARENT_COMMENT_ID},urn:li:activity:{ACTIVITY_ID})"
URN_PLAIN = f"urn:li:comment:(activity:{ACTIVITY_ID},{PARENT_COMMENT_ID})"
TEXT = "merci"

CSRF = JSESSIONID.strip('"')
COOKIE = f'li_at={LI_AT}; JSESSIONID="{CSRF}"'

H = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Cookie": COOKIE,
    "csrf-token": CSRF,
    "x-restli-protocol-version": "2.0.0",
    "x-li-lang": "en_US",
    "Origin": "https://www.linkedin.com",
    "Referer": f"https://www.linkedin.com/feed/update/urn:li:activity:{ACTIVITY_ID}",
    "x-li-page-instance": "urn:li:page:d_flagship3_feed;1P7oCArhQQ6gPYdwmjX6zQ==",
    "x-li-track": '{"clientVersion":"1.13.43773","mpVersion":"1.13.43773","osName":"web","timezoneOffset":2,"timezone":"Europe/Paris","deviceFormFactor":"DESKTOP","mpName":"voyager-web"}',
    "Accept": "application/vnd.linkedin.normalized+json+2.1",
    "Content-Type": "application/json; charset=UTF-8",
}


def t(name, method, url, body):
    print(f"\n=== {name} ===")
    print(f"{method} {url}")
    if isinstance(body, dict):
        body = json.dumps(body)
    try:
        r = requests.request(method, url, headers=H, data=body, timeout=20)
        print(f"  {r.status_code}: {r.text[:300].replace(chr(10),' ')}")
        if r.status_code in (200, 201):
            try:
                j = r.json()
                if not (isinstance(j, dict) and j.get("status", 0) >= 400):
                    print("  >>>> SUCCESS <<<<")
                    return True
            except Exception:
                print("  >>>> SUCCESS (non-JSON 2xx) <<<<")
                return True
    except Exception as e:
        print(f"  ERROR: {e}")
    return False


print("\n========== C1 PAYLOAD VARIANTS on /feed/comments?action=create ==========")
URL_C1 = "https://www.linkedin.com/voyager/api/feed/comments?action=create"

# A. Original shape
t("C1.A original", "POST", URL_C1, {
    "updateId": f"activity:{ACTIVITY_ID}", "parentComment": URN_FS,
    "commentary": {"text": TEXT},
})
# B. With attributes
t("C1.B w/ attributes", "POST", URL_C1, {
    "updateId": f"activity:{ACTIVITY_ID}", "parentComment": URN_FS,
    "commentary": {"text": TEXT, "attributes": []},
})
# C. commentV2 variant
t("C1.C commentV2", "POST", URL_C1, {
    "updateId": f"activity:{ACTIVITY_ID}", "parentComment": URN_FS,
    "commentV2": {"text": TEXT, "attributes": []},
})
# D. fsd_comment URN
t("C1.D fsd_comment URN", "POST", URL_C1, {
    "updateId": f"activity:{ACTIVITY_ID}", "parentComment": URN_FSD,
    "commentary": {"text": TEXT},
})
# E. plain comment URN
t("C1.E plain comment URN", "POST", URL_C1, {
    "updateId": f"activity:{ACTIVITY_ID}", "parentComment": URN_PLAIN,
    "commentary": {"text": TEXT},
})
# F. thread instead of updateId (rest.li style)
t("C1.F thread/parent", "POST", URL_C1, {
    "thread": ACTIVITY_URN, "parent": URN_FSD,
    "commentary": {"text": TEXT, "attributes": []},
})
# G. socialDetail wrapper
t("C1.G socialDetail wrapper", "POST", URL_C1, {
    "socialDetail": {"thread": ACTIVITY_URN},
    "parentComment": URN_FS, "commentary": {"text": TEXT},
})
# H. minimal — just text + thread
t("C1.H minimal", "POST", URL_C1, {
    "thread": ACTIVITY_URN, "commentary": {"text": TEXT},
})
# I. wrapped in element
t("C1.I element wrap", "POST", URL_C1, {
    "element": {
        "updateId": f"activity:{ACTIVITY_ID}",
        "parentComment": URN_FS,
        "commentary": {"text": TEXT},
    }
})
# J. with newComment top-level
t("C1.J newComment wrap", "POST", URL_C1, {
    "newComment": {
        "updateId": f"activity:{ACTIVITY_ID}",
        "parentComment": URN_FS,
        "commentary": {"text": TEXT},
    }
})

print("\n========== voyagerSocialDashComments variants ==========")
URL_DASH = "https://www.linkedin.com/voyager/api/voyagerSocialDashComments?action=create"

# K. dash-style with thread + parentComment
t("K.dash A", "POST", URL_DASH, {
    "thread": ACTIVITY_URN, "parentComment": URN_FSD,
    "commentary": {"text": TEXT, "attributes": []},
})
# L. dash with comment field wrapper
t("K.dash element wrap", "POST", URL_DASH, {
    "element": {
        "thread": ACTIVITY_URN, "parentComment": URN_FSD,
        "commentary": {"text": TEXT, "attributes": []},
    }
})
# M. dash with comment as top object
t("K.dash comment", "POST", URL_DASH, {
    "comment": {
        "thread": ACTIVITY_URN, "parentComment": URN_FSD,
        "commentary": {"text": TEXT, "attributes": []},
    }
})

print("\n========== Better GraphQL queryId discovery ==========")
# Hit common LinkedIn manifest endpoints to find current bundle hashes
manifest_urls = [
    f"https://www.linkedin.com/feed/update/urn:li:activity:{ACTIVITY_ID}",
    "https://www.linkedin.com/feed/",
    "https://www.linkedin.com/preload/?_bprMode=vanilla",
]
all_query_ids = set()
all_bundles = set()
for u in manifest_urls:
    try:
        r = requests.get(u, headers={**H, "Accept": "text/html"}, timeout=20)
        # Find any voyager*Dash*.<hash> queryIds inline
        all_query_ids.update(re.findall(r"voyager[A-Za-z]*Dash[A-Za-z]*\.[a-f0-9]{30,}", r.text))
        all_query_ids.update(re.findall(r"voyager[A-Za-z]*Dash[A-Za-z]*\.[a-f0-9]+", r.text))
        # Find JS bundles
        all_bundles.update(re.findall(r'(https?://static\.licdn\.com/[^\s"\']+\.js)', r.text))
        # Inline scripts that may reference queryIds
        all_query_ids.update(re.findall(r'(voyager[A-Za-z]+Dash[A-Za-z]+\.\w{8,})', r.text))
    except Exception as e:
        print(f"  fetch {u} failed: {e}")
print(f"  Bundles found: {len(all_bundles)}")
print(f"  Inline queryIds: {sorted(set(q for q in all_query_ids if 'Comment' in q))}")

# Scan up to 30 bundles for comment-related queryIds
for i, b in enumerate(sorted(all_bundles)):
    if i >= 30:
        break
    if not any(k in b.lower() for k in ("comment", "feed", "social", "main", "lib")):
        continue
    try:
        rr = requests.get(b, timeout=20)
        all_query_ids.update(re.findall(r'(voyager[A-Za-z]+Dash[A-Za-z]+\.\w{8,})', rr.text))
        all_query_ids.update(re.findall(r'queryId\s*[:=]\s*["\'](voyager[^"\']+)["\']', rr.text))
    except Exception:
        pass

comment_ids = sorted({q for q in all_query_ids if "Comment" in q})
print(f"  Comment-related queryIds discovered: {comment_ids[:15]}")

# Try each
for qid in comment_ids[:10]:
    url = f"https://www.linkedin.com/voyager/api/graphql?action=execute&queryId={qid}"
    # Standard rest.li-style variables for GraphQL mutations on comments
    enc = urllib.parse.quote
    variables = (
        f"(threadUrn:{enc(ACTIVITY_URN, safe='')},"
        f"commentary:(text:{TEXT},attributes:List()),"
        f"parentCommentUrn:{enc(URN_FSD, safe='')})"
    )
    body = f"variables={variables}"
    h2 = {**H, "Accept": "application/graphql",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"}
    print(f"\n=== GraphQL {qid} ===")
    print(f"POST {url}")
    try:
        r = requests.post(url, headers=h2, data=body, timeout=20)
        print(f"  {r.status_code}: {r.text[:300].replace(chr(10),' ')}")
        if r.status_code in (200, 201):
            try:
                j = r.json()
                if isinstance(j, dict) and j.get("data") and not (isinstance(j.get("data"), dict) and j["data"].get("status", 0) >= 400):
                    print("  >>>> SUCCESS <<<<")
            except Exception:
                pass
    except Exception as e:
        print(f"  ERROR: {e}")
