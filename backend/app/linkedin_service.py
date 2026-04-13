"""
Bridge between async FastAPI and the synchronous open_linkedin_api library.

Every public function that hits the LinkedIn API is async and delegates to
``asyncio.to_thread`` so the event loop is never blocked.
"""

import asyncio
import logging
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
    API to accept it.
    """
    raw_jsessionid = jsessionid
    if raw_jsessionid and not raw_jsessionid.startswith('"'):
        raw_jsessionid = f'"{raw_jsessionid}"'

    cookie_jar = requests.utils.cookiejar_from_dict({
        "li_at": li_at,
        "JSESSIONID": raw_jsessionid,
    })

    client = Linkedin("", "", cookies=cookie_jar)
    return client


# ---------------------------------------------------------------------------
# Cookie validation
# ---------------------------------------------------------------------------

async def validate_cookies(li_at: str, jsessionid: str) -> bool:
    """Test whether the supplied cookies are still valid.

    Returns ``True`` when LinkedIn accepts the session, ``False`` otherwise.
    """
    try:
        client = get_linkedin_client(li_at, jsessionid)
        profile = await asyncio.to_thread(client.get_user_profile, False)
        return bool(profile)
    except UnauthorizedException:
        return False
    except Exception:
        logger.exception("Unexpected error while validating LinkedIn cookies")
        return False


# ---------------------------------------------------------------------------
# People search
# ---------------------------------------------------------------------------

async def search_people(
    client: Linkedin,
    keywords: str,
    limit: int = 10,
    offset: int = 0,
    regions: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Search for people on LinkedIn.

    Returns a list of minimal profile dicts with keys such as ``urn_id``,
    ``name``, ``jobtitle``, ``location``, ``distance``, ``navigation_url``.
    """
    try:
        kwargs = dict(
            keywords=keywords,
            limit=limit,
            offset=offset,
        )
        if regions:
            kwargs["regions"] = regions
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

async def resolve_contact_urn(client: Linkedin, contact) -> Optional[str]:
    """Try to resolve a valid urn_id for a contact.

    Strategy:
    1. Try get_profile with existing urn_id → extract fresh urn
    2. Try get_profile with public_id (from DB or linkedin_url) → extract urn
    3. Search by name → match best result → extract urn

    Returns the resolved urn_id or None if all strategies fail.
    Updates contact fields in-place (caller must commit).
    """
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


def _update_connection_status(contact, profile: dict) -> None:
    """Update contact.connection_status from LinkedIn profile data."""
    distance = profile.get("distance")
    if distance:
        contact.connection_status = str(distance)


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
    """Reply to a comment on a post. Returns True on success."""
    try:
        success = await asyncio.to_thread(
            client.reply_to_comment,
            activity_urn,
            parent_comment_urn,
            reply_text,
        )
        return success
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during reply_to_comment")
        raise
    except Exception:
        logger.exception("Error in reply_to_comment for comment_urn=%s", parent_comment_urn)
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
