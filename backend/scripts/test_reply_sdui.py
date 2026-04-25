#!/usr/bin/env python3
"""Replay the SDUI createComment request captured from the browser."""
import json
import os
import sys

import requests

LI_AT = os.environ["LI_AT"]
JSESSIONID = os.environ["JSESSIONID"]
CSRF = JSESSIONID.strip('"')
COOKIE = f'li_at={LI_AT}; JSESSIONID="{CSRF}"'

# Target — comment 7453748376971522048 on activity 7453340725200621568
ACTIVITY_ID = "7453340725200621568"
ACTIVITY_URN = f"urn:li:activity:{ACTIVITY_ID}"
TEXT = "merci"

URL = ("https://www.linkedin.com/flagship-web/rsc-action/actions/server-request"
       "?sduiid=com.linkedin.sdui.comments.createComment&parentSpanId=oqa5M%2FzM%2F6U%3D")

HEADERS = {
    "accept": "*/*",
    "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "content-type": "application/json",
    "Cookie": COOKIE,
    "csrf-token": CSRF,
    "origin": "https://www.linkedin.com",
    "referer": "https://www.linkedin.com/feed/",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "x-li-anchor-page-key": "d_flagship3_feed",
    "x-li-application-instance": "y/DwIwYkQxiK7Y6NnaLCiA==",
    "x-li-application-version": "0.2.5114",
    "x-li-page-instance": "urn:li:page:d_flagship3_feed;1P7oCArhQQ6gPYdwmjX6zQ==",
    "x-li-page-instance-tracking-id": "1P7oCArhQQ6gPYdwmjX6zQ==",
    "x-li-pageforestid": "0006504624b1039400b6ff1f0c5c0439",
    "x-li-rsc-stream": "true",
    "x-li-traceparent": "00-0006504624b1039400b6ff1f0c5c0439-f775a4833af5315e-00",
    "x-li-tracestate": "LinkedIn=f775a4833af5315e",
    "x-li-track": ('{"clientVersion":"0.2.5114","mpVersion":"0.2.5114","osName":"web",'
                   '"timezoneOffset":2,"timezone":"Europe/Paris","deviceFormFactor":"DESKTOP",'
                   '"mpName":"web","displayDensity":1.5,"displayWidth":2160,"displayHeight":1350}'),
}

# Replicate the request body the browser sent, with TEXT replacing "VIRAL"
state_key_id = "CgsIgMDIuM35yu/OAQ-WmgpV5ac1M5NlEP05I6U30Yhq7_njYO50ww_pMILPKMFeedType_MAIN_FEED_RELEVANCE"
identity_key = f"identitySwitcherActorContext-{ACTIVITY_URN}"

body = {
    "requestId": "com.linkedin.sdui.comments.createComment",
    "serverRequest": {
        "requestId": "com.linkedin.sdui.comments.createComment",
        "requestedArguments": {
            "$type": "proto.sdui.actions.requests.RequestedArguments",
            "payload": {
                "optimisticKey": "auto-component-test-merci-001",
                "collection": {
                    "updateKey": {
                        "feedType": 72,
                        "items": [{
                            "feedUpdateUrn": {
                                "updateUrnActivityUrn": {
                                    "__typename": "proto_com_linkedin_common_ActivityUrn",
                                    "activityUrn": {"activityId": "7453345264641257472"}
                                }
                            },
                            "trackingId": "wvhKT4kxVnsg9DchNvWfFg=="
                        }],
                        "isVideoCarousel": False,
                    },
                    "threadUrn": {
                        "threadUrnActivityThreadUrn": {
                            "__typename": "proto_com_linkedin_common_ActivityUrn",
                            "activityUrn": {"activityId": ACTIVITY_ID}
                        }
                    }
                },
                "commentFieldBinding": {"key": f"commentBoxText-{state_key_id}", "namespace": "MemoryNamespace"},
                "richCommentFieldBinding": {"key": f"richCommentBoxText-{state_key_id}", "namespace": "MemoryNamespace"},
                "linkPreviewIngestedContentId": {"key": f"commentBoxLinkPreviewIngestedContentId-{state_key_id}", "namespace": "MemoryNamespace"},
            },
            "requestedStateKeys": [
                {"$type": "proto.sdui.StateKey", "value": f"commentBoxText-{state_key_id}",
                 "key": {"$type": "proto.sdui.Key", "value": {"$case": "id", "id": f"commentBoxText-{state_key_id}"}},
                 "namespace": "MemoryNamespace", "isEncrypted": False},
                {"$type": "proto.sdui.StateKey", "value": f"richCommentBoxText-{state_key_id}",
                 "key": {"$type": "proto.sdui.Key", "value": {"$case": "id", "id": f"richCommentBoxText-{state_key_id}"}},
                 "namespace": "MemoryNamespace", "isEncrypted": False},
                {"$type": "proto.sdui.StateKey", "value": f"commentBoxLinkPreviewIngestedContentId-{state_key_id}",
                 "key": {"$type": "proto.sdui.Key", "value": {"$case": "id", "id": f"commentBoxLinkPreviewIngestedContentId-{state_key_id}"}},
                 "namespace": "MemoryNamespace", "isEncrypted": False},
            ],
            "requestMetadata": {
                "$type": "proto.sdui.common.RequestMetadata",
                "currentActor": {
                    "$type": "proto.sdui.bindings.core.Bindable",
                    "stateKey": "",
                    "key": {"$type": "proto.sdui.StateKey", "value": identity_key,
                            "key": {"$type": "proto.sdui.Key", "value": {"$case": "id", "id": identity_key}},
                            "namespace": "MemoryNamespace", "isEncrypted": False},
                    "content": {"$case": "stringBinding",
                                "stringBinding": {"$type": "proto.sdui.bindings.core.BindableString", "stateKey": ""}}
                }
            }
        },
        "onClientRequestFailureAction": {"actions": []},
        "isApfcEnabled": False, "isStreaming": False, "rumPageKey": ""
    },
    "states": [
        {"key": f"commentBoxText-{state_key_id}", "namespace": "MemoryNamespace",
         "value": TEXT, "originalProtoCase": "stringValue"},
        {"key": f"richCommentBoxText-{state_key_id}", "namespace": "MemoryNamespace",
         "value": {"text": TEXT, "attribute": [], "$type": "TextModel", "source": "local"},
         "originalProtoCase": "textModelForWrite"},
        {"key": f"commentBoxLinkPreviewIngestedContentId-{state_key_id}",
         "namespace": "MemoryNamespace", "value": "", "originalProtoCase": "stringValue"},
    ],
    "requestedArguments": {
        "$type": "proto.sdui.actions.requests.RequestedArguments",
        "payload": {
            "optimisticKey": "auto-component-test-merci-001",
            "collection": {
                "updateKey": {
                    "feedType": 72,
                    "items": [{"feedUpdateUrn": {"updateUrnActivityUrn": {
                        "__typename": "proto_com_linkedin_common_ActivityUrn",
                        "activityUrn": {"activityId": "7453345264641257472"}}},
                        "trackingId": "wvhKT4kxVnsg9DchNvWfFg=="}],
                    "isVideoCarousel": False},
                "threadUrn": {"threadUrnActivityThreadUrn": {
                    "__typename": "proto_com_linkedin_common_ActivityUrn",
                    "activityUrn": {"activityId": ACTIVITY_ID}}}
            },
            "commentFieldBinding": {"key": f"commentBoxText-{state_key_id}", "namespace": "MemoryNamespace"},
            "richCommentFieldBinding": {"key": f"richCommentBoxText-{state_key_id}", "namespace": "MemoryNamespace"},
            "linkPreviewIngestedContentId": {"key": f"commentBoxLinkPreviewIngestedContentId-{state_key_id}",
                                              "namespace": "MemoryNamespace"},
        },
        "requestedStateKeys": [
            {"$type": "proto.sdui.StateKey", "value": f"commentBoxText-{state_key_id}",
             "key": {"$type": "proto.sdui.Key", "value": {"$case": "id", "id": f"commentBoxText-{state_key_id}"}},
             "namespace": "MemoryNamespace", "isEncrypted": False},
            {"$type": "proto.sdui.StateKey", "value": f"richCommentBoxText-{state_key_id}",
             "key": {"$type": "proto.sdui.Key", "value": {"$case": "id", "id": f"richCommentBoxText-{state_key_id}"}},
             "namespace": "MemoryNamespace", "isEncrypted": False},
            {"$type": "proto.sdui.StateKey", "value": f"commentBoxLinkPreviewIngestedContentId-{state_key_id}",
             "key": {"$type": "proto.sdui.Key", "value": {"$case": "id", "id": f"commentBoxLinkPreviewIngestedContentId-{state_key_id}"}},
             "namespace": "MemoryNamespace", "isEncrypted": False},
        ],
        "requestMetadata": {
            "$type": "proto.sdui.common.RequestMetadata",
            "currentActor": {
                "$type": "proto.sdui.bindings.core.Bindable", "stateKey": "",
                "key": {"$type": "proto.sdui.StateKey", "value": identity_key,
                        "key": {"$type": "proto.sdui.Key", "value": {"$case": "id", "id": identity_key}},
                        "namespace": "MemoryNamespace", "isEncrypted": False},
                "content": {"$case": "stringBinding",
                            "stringBinding": {"$type": "proto.sdui.bindings.core.BindableString", "stateKey": ""}}
            }
        }
    },
    "states": [
        {"key": f"commentBoxText-{state_key_id}", "namespace": "MemoryNamespace",
         "value": TEXT, "originalProtoCase": "stringValue"},
        {"key": f"richCommentBoxText-{state_key_id}", "namespace": "MemoryNamespace",
         "value": {"text": TEXT, "attribute": [], "$type": "TextModel", "source": "local"},
         "originalProtoCase": "textModelForWrite"},
        {"key": f"commentBoxLinkPreviewIngestedContentId-{state_key_id}",
         "namespace": "MemoryNamespace", "value": "", "originalProtoCase": "stringValue"},
    ],
    "screenId": "com.linkedin.sdui.flagshipnav.feed.MainFeed",
}

print("=== SDUI replay: createComment ===")
print(f"POST {URL}")
print(f"Body size: {len(json.dumps(body))} bytes")
r = requests.post(URL, headers=HEADERS, data=json.dumps(body), timeout=30)
print(f"Status: {r.status_code}")
print(f"Body (first 2000 chars):\n{r.text[:2000]}")
print()
if r.status_code == 200 and "error" not in r.text.lower()[:200]:
    print(">>>> Possibly succeeded — check the post on LinkedIn <<<<")
