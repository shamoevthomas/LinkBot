"""
Bridge between async FastAPI and the synchronous open_linkedin_api library.

Every public function that hits the LinkedIn API is async and delegates to
``asyncio.to_thread`` so the event loop is never blocked.
"""

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional

import requests
from open_linkedin_api.linkedin import Linkedin
from open_linkedin_api.exceptions import (
    UnauthorizedException,
    LinkedInRequestException,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Client construction
# ---------------------------------------------------------------------------

def get_linkedin_client(li_at: str, jsessionid: str) -> Linkedin:
    """Create and return a configured :class:`Linkedin` client instance.

    The JSESSIONID cookie must be wrapped in double-quotes for the Voyager
    API to accept it. We also clamp every HTTP request to a 30s timeout and
    cap redirects at 5 — LinkedIn's "Exceeded 30 redirects" pattern (which
    fires when cookies are dead) used to take 1-3 minutes per call and
    blocked the scheduler. With max_redirects=5 the same call fails fast.
    """
    raw_jsessionid = jsessionid
    if raw_jsessionid and not raw_jsessionid.startswith('"'):
        raw_jsessionid = f'"{raw_jsessionid}"'

    cookie_jar = requests.utils.cookiejar_from_dict({
        "li_at": li_at,
        "JSESSIONID": raw_jsessionid,
    })

    client = Linkedin("", "", cookies=cookie_jar)

    # Wrap the underlying session so every voyager call has a strict timeout
    # and a low redirect cap — fail fast on dead cookies.
    try:
        if hasattr(client, "client") and hasattr(client.client, "session"):
            session = client.client.session
            session.max_redirects = 5
            original_request = session.request

            def _request_with_timeout(method, url, **kwargs):
                kwargs.setdefault("timeout", 30)
                return original_request(method, url, **kwargs)

            session.request = _request_with_timeout
    except Exception:
        logger.exception("Could not patch LinkedIn session timeout")

    return client


def is_dead_cookie_error(exc: BaseException) -> bool:
    """Detect the signature LinkedIn returns when cookies are expired/revoked."""
    msg = str(exc)
    return (
        "Exceeded 30 redirects" in msg
        or "TooManyRedirects" in msg
        or "Exceeded 5 redirects" in msg  # our new lower cap
        or isinstance(exc, UnauthorizedException)
    )


def mark_cookies_invalid(user_id: int) -> None:
    """Flip cookies_valid=False for a user. Safe to call from any thread."""
    from app.database import SessionLocal
    from app.models import User
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user_id).first()
        if u and u.cookies_valid is not False:
            u.cookies_valid = False
            db.commit()
            logger.warning("Marked cookies invalid for user %d (LinkedIn rejected)", user_id)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Cookie validation
# ---------------------------------------------------------------------------

async def validate_cookies(li_at: str, jsessionid: str) -> Optional[bool]:
    """Test whether the supplied cookies are still valid.

    Returns:
        True  — LinkedIn returned the user's profile, cookies definitely OK.
        False — LinkedIn explicitly rejected them (UnauthorizedException).
        None  — Transient/network error (TooManyRedirects, timeout, connection
                reset, etc.). Caller should NOT flip cookies_valid on this —
                a redirect glitch can hit perfectly valid cookies and we don't
                want to logout the user on every flaky LinkedIn response.
    """
    import requests as _req
    try:
        client = get_linkedin_client(li_at, jsessionid)
        profile = await asyncio.to_thread(client.get_user_profile, False)
        return bool(profile)
    except UnauthorizedException:
        return False
    except _req.exceptions.TooManyRedirects:
        # LinkedIn occasionally bounces even valid sessions through a redirect
        # loop (login → home → login). Treat as transient.
        logger.warning("validate_cookies: TooManyRedirects (transient)")
        return None
    except (_req.exceptions.Timeout, _req.exceptions.ConnectionError):
        logger.warning("validate_cookies: network error (transient)")
        return None
    except Exception:
        logger.exception("Unexpected error while validating LinkedIn cookies")
        return None


# ---------------------------------------------------------------------------
# People search
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Free-text location → LinkedIn geoUrn resolver
#
# LinkedIn's people-search filter only accepts geoUrn IDs (e.g. "102596514"
# for Mulhouse). The classic typeahead endpoints are gated by rotating
# GraphQL queryIds we can't reliably reach. But the public jobs-search HTML
# page resolves "?location=<text>" server-side and exposes the URN as
# `urn:li:fsd_geo:<id>` in the response body.
# This is hacky but stable — it's a documented public URL, not an API.
# ---------------------------------------------------------------------------
_geo_urn_cache: Dict[str, str] = {}
_GEO_URN_PATTERN = re.compile(r"urn:li:fsd_geo:(\d+)")

# The jobs page only understands country names in English (or in the country's
# own language). Given "Belgique" it does NOT fail — it silently falls back to
# the *account's* country and embeds that geoUrn instead, so "Belgique",
# "Allemagne" and "Espagne" all resolved to France (105015875) and campaigns
# quietly targeted the wrong country. These aliases short-circuit the scrape
# for the names users actually type. Verified against LinkedIn.
_GEO_ALIASES: Dict[str, str] = {
    "france": "105015875",
    "belgique": "100565514",
    "belgium": "100565514",
    "suisse": "106693272",
    "switzerland": "106693272",
    "luxembourg": "104042105",
    "allemagne": "101282230",
    "germany": "101282230",
    "espagne": "105646813",
    "spain": "105646813",
    "italie": "103350119",
    "italy": "103350119",
    "royaume-uni": "101165590",
    "royaume uni": "101165590",
    "angleterre": "101165590",
    "united kingdom": "101165590",
    "pays-bas": "102890719",
    "pays bas": "102890719",
    "netherlands": "102890719",
    "portugal": "100364837",
    "maroc": "102787409",
    "morocco": "102787409",
    "tunisie": "102134353",
    "tunisia": "102134353",
    "algerie": "106395874",
    "algérie": "106395874",
    "algeria": "106395874",
    "canada": "101174742",
    "etats-unis": "103644278",
    "états-unis": "103644278",
    "usa": "103644278",
    "united states": "103644278",
    "irlande": "104738515",
    "ireland": "104738515",
}

# Probing with a nonsense location tells us which geoUrn this account falls
# back to. Anything that resolves to the same value is a silent fallback, not
# a real match. Cached per process.
_GEO_FALLBACK_PROBE = "zzq-linky-invalid-location-zzq"
_geo_fallback_urn: Optional[str] = None
_geo_fallback_probed = False


def _scrape_geo_urn(name: str, li_at: str, jsessionid: str) -> Optional[str]:
    """Raw scrape: ask the public jobs-search page for a location's geoUrn."""
    try:
        sess = requests.Session()
        raw_jsessionid = jsessionid or ""
        if raw_jsessionid and not raw_jsessionid.startswith('"'):
            raw_jsessionid = f'"{raw_jsessionid}"'
        sess.cookies.update({"li_at": li_at, "JSESSIONID": raw_jsessionid})
        sess.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/145.0.0.0",
        })
        url = f"https://www.linkedin.com/jobs/search/?keywords=&location={requests.utils.quote(name)}"
        resp = sess.get(url, timeout=15, allow_redirects=True)
        if resp.status_code != 200:
            return None
        match = _GEO_URN_PATTERN.search(resp.text)
        return match.group(1) if match else None
    except Exception:
        logger.exception("resolve_geo_urn failed for %r", name)
        return None


def _get_fallback_urn(li_at: str, jsessionid: str) -> Optional[str]:
    """geoUrn LinkedIn returns for an unparseable location (= account country)."""
    global _geo_fallback_urn, _geo_fallback_probed
    if not _geo_fallback_probed:
        _geo_fallback_probed = True
        _geo_fallback_urn = _scrape_geo_urn(_GEO_FALLBACK_PROBE, li_at, jsessionid)
        logger.info("resolve_geo_urn: account fallback geoUrn = %s", _geo_fallback_urn)
    return _geo_fallback_urn


def resolve_geo_urn(name: str, li_at: str, jsessionid: str) -> Optional[str]:
    """Resolve a free-text location ("Mulhouse", "Île-de-France", "Lyon") to
    a LinkedIn geoUrn ID. Returns None when the location can't be resolved —
    including when LinkedIn silently substitutes the account's own country.
    """
    if not name:
        return None
    key = name.strip().lower()
    if not key:
        return None

    alias = _GEO_ALIASES.get(key)
    if alias:
        return alias

    if key in _geo_urn_cache:
        return _geo_urn_cache[key]
    if not li_at:
        return None

    urn = _scrape_geo_urn(name, li_at, jsessionid)
    if not urn:
        return None

    # Reject the silent fallback. A location that is genuinely the account's
    # own country is covered by _GEO_ALIASES above, so reaching here with the
    # fallback URN means LinkedIn didn't understand the name.
    fallback = _get_fallback_urn(li_at, jsessionid)
    if fallback and urn == fallback:
        logger.warning(
            "resolve_geo_urn: %r resolved to the account's fallback geoUrn (%s) "
            "— treating as unresolved rather than silently targeting it",
            name, urn,
        )
        return None

    _geo_urn_cache[key] = urn
    return urn


async def search_people(
    client: Linkedin,
    keywords: str,
    limit: int = 10,
    offset: int = 0,
    regions: Optional[List[str]] = None,
    location_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Search for people on LinkedIn.

    Returns a list of minimal profile dicts with keys such as ``urn_id``,
    ``name``, ``jobtitle``, ``location``, ``distance``, ``navigation_url``.

    Pass either ``regions`` (list of LinkedIn geoUrn IDs, the precise way) OR
    ``location_name`` (free-text string like "Lyon" or "Île-de-France" — uses
    LinkedIn's locationFallback so the engine fuzzy-matches server-side).
    """
    try:
        kwargs = dict(
            keywords=keywords,
            limit=limit,
            offset=offset,
        )
        if regions:
            kwargs["regions"] = regions
        if location_name:
            kwargs["location_name"] = location_name
        results = await asyncio.to_thread(
            client.search_people,
            **kwargs,
        )
        return results or []
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during search_people")
        raise
    except Exception:
        logger.exception("Error in search_people")
        raise


# ---------------------------------------------------------------------------
# URN resolution with fallback
# ---------------------------------------------------------------------------

# LinkedIn member URNs look like "ACoAADRyNK0BIl-IHVizIb3CEgBV6Nsdxlsq8MA":
# a fixed ACoA prefix followed by ~35 URL-safe base64 characters.
_PROFILE_URN_RE = re.compile(r"^ACoA[A-Za-z0-9_-]{20,}$")


def _looks_like_profile_urn(urn_id: Optional[str]) -> bool:
    return bool(urn_id) and bool(_PROFILE_URN_RE.match(urn_id.strip()))


async def resolve_contact_urn(client: Linkedin, contact) -> Optional[str]:
    """Try to resolve a valid urn_id for a contact.

    Strategy:
    1. Try get_profile with existing urn_id → extract fresh urn
    2. Try get_profile with public_id (from DB or linkedin_url) → extract urn
    3. Search by name → match best result → extract urn

    Returns the resolved urn_id or None if all strategies fail.
    Updates contact fields in-place (caller must commit).
    """
    # Strategy 0: trust a well-formed URN we already hold.
    #
    # Search results already carry a valid profile URN, so fetching the profile
    # merely to confirm it spends a profile view per prospect — the scarcest
    # thing on a LinkedIn account, capped monthly by the commercial-use limit.
    # Once that cap is hit LinkedIn redirect-loops every profile fetch, and this
    # function then returns None for everyone: campaigns stop even though the
    # session is fine and the URN in hand was correct all along.
    # Sending with the stored URN costs nothing extra; if it turns out to be
    # stale the send fails and is logged, which is the same outcome as before.
    if _looks_like_profile_urn(contact.urn_id):
        return contact.urn_id

    # Strategy 1: existing urn_id (skip if purely numeric – wrong format)
    if contact.urn_id and not contact.urn_id.isdigit():
        try:
            profile = await get_profile(client, urn_id=contact.urn_id)
            if profile and profile.get("profile_id"):
                _update_connection_status(contact, profile)
                return contact.urn_id
        except Exception:
            pass

    # Strategy 2: public_id
    pub_id = contact.public_id
    if not pub_id and contact.linkedin_url:
        url = contact.linkedin_url.rstrip("/")
        if "/in/" in url:
            pub_id = url.split("/in/")[-1].split("?")[0]

    if pub_id:
        try:
            profile = await get_profile(client, public_id=pub_id)
            if profile:
                # Prefer urn_id (fsd_profile format) over profile_id (numeric member ID)
                new_urn = profile.get("urn_id") or profile.get("profile_id")
                if new_urn:
                    logger.info("Resolved urn via public_id %s -> %s", pub_id, new_urn)
                    contact.urn_id = new_urn
                    if not contact.public_id:
                        contact.public_id = pub_id
                    _update_connection_status(contact, profile)
                    return new_urn
        except Exception:
            pass

    # Strategy 3: search by name — prefer secondary signal, fallback to name-only match
    name_query = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
    if name_query:
        try:
            results = await search_people(client, keywords=name_query, limit=5)
            name_matches = []  # collect (urn, has_secondary) tuples
            for r in results:
                r_urn = r.get("urn_id", "")
                r_name = r.get("name", "").lower()
                expected = name_query.lower()
                # Name must match
                name_ok = r_name == expected or (
                    contact.first_name and contact.first_name.lower() in r_name
                    and contact.last_name and contact.last_name.lower() in r_name
                )
                if not name_ok:
                    continue
                # Check secondary signal (headline/jobtitle or location)
                secondary_match = False
                r_jobtitle = (r.get("jobtitle") or "").lower()
                r_location = (r.get("location") or "").lower()
                c_headline = (contact.headline or "").lower()
                c_location = (contact.location or "").lower()
                if c_headline and r_jobtitle:
                    title_words = {w for w in r_jobtitle.split() if len(w) > 2}
                    headline_words = {w for w in c_headline.split() if len(w) > 2}
                    if title_words & headline_words:
                        secondary_match = True
                if not secondary_match and c_location and r_location:
                    if c_location in r_location or r_location in c_location:
                        secondary_match = True
                name_matches.append((r_urn, secondary_match))

            # Pick best match: prefer secondary-confirmed, else take first name match
            for r_urn, has_secondary in name_matches:
                if has_secondary:
                    logger.info("Resolved urn via search '%s' -> %s (confirmed by secondary signal)", name_query, r_urn)
                    contact.urn_id = r_urn
                    return r_urn
            if name_matches:
                r_urn = name_matches[0][0]
                logger.info("Resolved urn via search '%s' -> %s (name-only match, no secondary signal)", name_query, r_urn)
                contact.urn_id = r_urn
                return r_urn
        except Exception:
            pass

    return None


def extract_profile_picture_url(profile: dict) -> Optional[str]:
    """Combine displayPictureUrl + largest img_* artifact from a get_profile result."""
    if not profile:
        return None
    root = profile.get("displayPictureUrl")
    if not root:
        return None
    img_keys = [k for k in profile.keys() if k.startswith("img_")]
    if not img_keys:
        return None

    def _w(k: str) -> int:
        try:
            return int(k.split("_")[1])
        except (ValueError, IndexError):
            return 0

    img_keys.sort(key=_w, reverse=True)
    seg = profile.get(img_keys[0])
    if not seg:
        return None
    return f"{root}{seg}"


def _update_connection_status(contact, profile: dict) -> None:
    """Update contact.connection_status + profile_picture_url from LinkedIn profile data."""
    distance = profile.get("distance")
    if distance:
        contact.connection_status = str(distance)
    if not contact.profile_picture_url:
        pic = extract_profile_picture_url(profile)
        if pic:
            contact.profile_picture_url = pic


# ---------------------------------------------------------------------------
# Connection requests
# ---------------------------------------------------------------------------

async def send_connection_request(
    client: Linkedin,
    urn_id: str,
    message: Optional[str] = None,
) -> Dict[str, Any]:
    """Send a connection request to the user identified by *urn_id*.

    Returns the API response dict on success.
    """
    try:
        result = await asyncio.to_thread(
            client.send_connection_request,
            urn_id=urn_id,
            message=message,
        )
        return result or {}
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during send_connection_request")
        raise
    except Exception:
        logger.exception("Error in send_connection_request for urn_id=%s", urn_id)
        raise


# ---------------------------------------------------------------------------
# Direct messages
# ---------------------------------------------------------------------------

async def send_message(
    client: Linkedin,
    urn_id: str,
    message_body: str,
) -> bool:
    """Send a DM to the user identified by *urn_id*.

    Returns ``True`` on success (no error), ``False`` on failure.
    The LinkedIn library returns ``True`` on error, so we invert.
    """
    try:
        had_error = await asyncio.to_thread(
            client.send_message,
            message_body=message_body,
            recipients=[urn_id],
        )
        return not had_error
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during send_message")
        raise
    except Exception:
        logger.exception("Error in send_message for urn_id=%s", urn_id)
        raise


# ---------------------------------------------------------------------------
# Profile fetching
# ---------------------------------------------------------------------------

async def get_profile(
    client: Linkedin,
    urn_id: Optional[str] = None,
    public_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Fetch a full profile for the given *urn_id* or *public_id*."""
    try:
        profile = await asyncio.to_thread(
            client.get_profile,
            public_id=public_id,
            urn_id=urn_id,
        )
        return profile or {}
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during get_profile")
        raise
    except Exception:
        logger.exception("Error in get_profile for urn_id=%s public_id=%s", urn_id, public_id)
        raise


# ---------------------------------------------------------------------------
# Conversation / reply detection
# ---------------------------------------------------------------------------

async def get_conversation_details(
    client: Linkedin,
    urn_id: str,
) -> Dict[str, Any]:
    """Get conversation thread with a specific person by their URN ID."""
    try:
        result = await asyncio.to_thread(
            client.get_conversation_details, urn_id
        )
        return result or {}
    except Exception:
        logger.warning("Could not fetch conversation for urn_id=%s", urn_id)
        return {}


async def check_contact_replied(
    client: Linkedin,
    contact_urn_id: str,
) -> bool:
    """Check if a contact has sent us a message (i.e. replied).

    Uses LinkedIn's GraphQL messaging API. The conversation list is cached
    inside the Linkedin client so multiple calls per tick share one API hit.

    Returns True if the most recent message in the conversation was sent
    by the contact (not by us).
    """
    try:
        print(f"[REPLY CHECK] Checking urn_id={contact_urn_id}", flush=True)

        convo = await get_conversation_details(client, contact_urn_id)
        if not convo:
            print(f"[REPLY CHECK] No conversation found for {contact_urn_id}", flush=True)
            return False

        # GraphQL format: messages.elements[0].sender.hostIdentityUrn
        messages = convo.get("messages", {})
        elements = messages.get("elements", []) if isinstance(messages, dict) else []
        if not elements:
            print(f"[REPLY CHECK] No messages in conversation for {contact_urn_id}", flush=True)
            return False

        last_msg = elements[0]
        sender = last_msg.get("sender", {})
        sender_urn = sender.get("hostIdentityUrn", "")

        print(f"[REPLY CHECK] Last message sender={sender_urn}", flush=True)

        # Normalize contact URN for comparison
        if contact_urn_id.startswith("urn:"):
            contact_id = contact_urn_id.split(":")[-1]
        else:
            contact_id = contact_urn_id

        if sender_urn and contact_id in sender_urn:
            print(f"[REPLY CHECK] REPLY DETECTED for {contact_urn_id}", flush=True)
            return True

        print(f"[REPLY CHECK] No reply detected for {contact_urn_id}", flush=True)
        return False

    except Exception as exc:
        print(f"[REPLY CHECK] EXCEPTION for {contact_urn_id}: {exc}", flush=True)
        logger.exception("Error checking reply for urn_id=%s", contact_urn_id)
        return False


# ---------------------------------------------------------------------------
# Profile posts
# ---------------------------------------------------------------------------

async def get_profile_posts(
    client: Linkedin,
    urn_id: Optional[str] = None,
    public_id: Optional[str] = None,
    post_count: int = 3,
) -> List[Dict[str, Any]]:
    """Fetch recent posts for a profile. Returns raw post elements."""
    try:
        posts = await asyncio.to_thread(
            client.get_profile_posts,
            urn_id=urn_id,
            public_id=public_id,
            post_count=post_count,
        )
        return posts or []
    except Exception:
        logger.warning("Could not fetch posts for urn_id=%s", urn_id)
        return []


# ---------------------------------------------------------------------------
# Post comments
# ---------------------------------------------------------------------------

async def get_post_comments(
    client: Linkedin,
    post_urn: str,
    comment_count: int = 100,
) -> List[Dict[str, Any]]:
    """Fetch comments for a LinkedIn post."""
    try:
        results = await asyncio.to_thread(
            client.get_post_comments,
            post_urn,
            comment_count,
        )
        return results or []
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during get_post_comments")
        raise
    except Exception:
        logger.exception("Error in get_post_comments for post_urn=%s", post_urn)
        raise


async def like_comment(
    client: Linkedin,
    comment_urn: str,
) -> bool:
    """Like a comment. Returns True on success."""
    try:
        had_error = await asyncio.to_thread(
            client.react_to_comment,
            comment_urn,
        )
        return not had_error
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during like_comment")
        raise
    except Exception:
        logger.exception("Error in like_comment for comment_urn=%s", comment_urn)
        raise


async def reply_to_comment(
    client: Linkedin,
    activity_urn: str,
    parent_comment_urn: str,
    reply_text: str,
) -> bool:
    """Reply to a comment on a post. Returns True on success.

    LinkedIn closed `/voyager/api/feed/comments` in early 2026 — the route
    now returns 500 even with mobile UA spoofing, and the new SDUI endpoint
    requires live browser session state that can't be replayed server-side.
    So this one action drives a headless Chromium via Playwright. All other
    actions (like, dm, connect…) still use the fast HTTP path.
    """
    # The client's RequestsCookieJar can accumulate duplicate cookies across
    # subdomains (.linkedin.com vs www.linkedin.com). cookies.get() throws
    # CookieConflictError in that case — iterate the jar and take the first
    # matching cookie to be tolerant.
    def _first_cookie(name):
        try:
            return client.client.session.cookies.get(name)
        except Exception:
            return next(
                (c.value for c in client.client.session.cookies if c.name == name),
                None,
            )
    li_at = _first_cookie("li_at")
    jsessionid = _first_cookie("JSESSIONID")
    if not li_at or not jsessionid:
        logger.warning("reply_to_comment: missing cookies on client")
        return False

    from app.playwright_actions import reply_to_comment_via_browser
    try:
        return await reply_to_comment_via_browser(
            li_at=li_at,
            jsessionid=jsessionid,
            activity_urn=activity_urn,
            parent_comment_urn=parent_comment_urn,
            reply_text=reply_text,
        )
    except Exception:
        logger.exception("Error in reply_to_comment (Playwright) for comment_urn=%s", parent_comment_urn)
        raise


async def get_comment_replies(
    client: Linkedin,
    activity_urn: str,
    parent_comment_urn: str,
    count: int = 50,
) -> List[Dict[str, Any]]:
    """Fetch replies to a specific comment."""
    try:
        results = await asyncio.to_thread(
            client.get_comment_replies,
            activity_urn,
            parent_comment_urn,
            count,
        )
        return results or []
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during get_comment_replies")
        raise
    except Exception:
        logger.exception("Error in get_comment_replies for comment_urn=%s", parent_comment_urn)
        return []


async def get_invitations(
    client: Linkedin,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Fetch pending connection invitations."""
    try:
        results = await asyncio.to_thread(client.get_invitations, 0, limit)
        return results or []
    except Exception:
        logger.exception("Error in get_invitations")
        return []


async def accept_invitation(
    client: Linkedin,
    invitation_entity_urn: str,
    invitation_shared_secret: str,
) -> bool:
    """Accept a connection invitation."""
    try:
        result = await asyncio.to_thread(
            client.reply_invitation,
            invitation_entity_urn,
            invitation_shared_secret,
            "accept",
        )
        return result
    except Exception:
        logger.exception("Error accepting invitation %s", invitation_entity_urn)
        return False


# ---------------------------------------------------------------------------
# Connections list
# ---------------------------------------------------------------------------

async def get_user_connections(
    client: Linkedin,
    urn_id: str,
    limit: int = -1,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Fetch connections for the user identified by *urn_id*.

    Uses ``get_profile_connections`` under the hood which delegates to
    ``search_people(connection_of=urn_id)``.
    """
    try:
        results = await asyncio.to_thread(
            client.get_profile_connections,
            urn_id=urn_id,
            limit=limit,
            offset=offset,
        )
        return results or []
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during get_user_connections")
        raise
    except Exception:
        logger.exception("Error in get_user_connections for urn_id=%s", urn_id)
        raise
