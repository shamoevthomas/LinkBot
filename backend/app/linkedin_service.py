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
) -> List[Dict[str, Any]]:
    """Search for people on LinkedIn.

    Returns a list of minimal profile dicts with keys such as ``urn_id``,
    ``name``, ``jobtitle``, ``location``, ``distance``, ``navigation_url``.
    """
    try:
        results = await asyncio.to_thread(
            client.search_people,
            keywords=keywords,
            limit=limit,
            offset=offset,
        )
        return results or []
    except UnauthorizedException:
        logger.warning("LinkedIn cookies expired during search_people")
        raise
    except Exception:
        logger.exception("Error in search_people")
        raise


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


async def get_conversation_events(
    client: Linkedin,
    conversation_id: str,
) -> Dict[str, Any]:
    """Get messages/events in a conversation."""
    try:
        result = await asyncio.to_thread(
            client.get_conversation, conversation_id
        )
        return result or {}
    except Exception:
        logger.warning("Could not fetch conversation events for id=%s", conversation_id)
        return {}


async def check_contact_replied(
    client: Linkedin,
    contact_urn_id: str,
) -> bool:
    """Check if a contact has sent us a message (i.e. replied).

    Returns True if the last message in the conversation was sent by the
    contact (not by us).
    """
    try:
        convo = await get_conversation_details(client, contact_urn_id)
        if not convo:
            return False

        # The conversation object has lastActivityAt and participants.
        # The events contain the actual messages.
        convo_id = convo.get("id")
        if not convo_id:
            return False

        events_data = await get_conversation_events(client, convo_id)
        elements = events_data.get("elements", [])
        if not elements:
            return False

        # Events are ordered by time. The last element is the most recent.
        last_event = elements[-1]

        # Check who sent the last message.
        # The sender info is in "from" -> "messaging.MessagingMember" ->
        # "miniProfile" -> "entityUrn" or in "from" -> "member" URN.
        from_data = last_event.get("from", {})
        if not from_data:
            return False

        # Try to get the sender's URN
        sender_urn = None
        member = from_data.get("com.linkedin.voyager.messaging.MessagingMember", {})
        if member:
            mini = member.get("miniProfile", {})
            if mini:
                sender_urn = mini.get("entityUrn", "")
        if not sender_urn:
            member2 = from_data.get("member", "")
            if member2:
                sender_urn = member2

        if not sender_urn:
            return False

        # If the sender URN contains the contact's urn_id, they replied
        return contact_urn_id in sender_urn

    except Exception:
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
