import random
import base64
from typing import Dict, List, Any, Optional


def safe_dict_get(data: Dict, *keys: str, default: Any = "") -> Any:
    """
    Safely navigate nested dictionary keys and return value or default.

    This function eliminates repetitive try-except blocks for dictionary access.

    :param data: Dictionary to navigate
    :param keys: Sequence of keys to traverse
    :param default: Default value to return if key path doesn't exist
    :return: Value at the key path or default

    Example:
        safe_dict_get(data, "actor", "name", "text")
        instead of:
        try:
            return data["actor"]["name"]["text"]
        except (KeyError, TypeError):
            return ""
    """
    try:
        result = data
        for key in keys:
            result = result[key]
        return result if result is not None else default
    except (KeyError, TypeError):
        return default


def get_id_from_urn(urn: str):
    """
    Return the ID of a given Linkedin URN.

    Example: urn:li:fs_miniProfile:<id>
    """
    if not urn or ":" not in urn:
        return ""
    parts = urn.split(":")
    return parts[3] if len(parts) > 3 else ""


def get_urn_from_raw_update(raw_string: str) -> str:
    """
    Return the URN of a raw group update

    Example: urn:li:fs_miniProfile:<id>
    Example: urn:li:fs_updateV2:(<urn>,GROUP_FEED,EMPTY,DEFAULT,false)
    """
    return raw_string.split("(")[1].split(",")[0]


def get_update_author_name(d_included: Dict) -> str:
    """Parse a dict and returns, if present, the post author name

    :param d_included: a dict, as returned by res.json().get("included", {})
    :type d_raw: dict

    :return: Author name
    :rtype: str
    """
    return safe_dict_get(d_included, "actor", "name", "text", default="")


def get_update_old(d_included: Dict) -> str:
    """Parse a dict and returns, if present, the post old string

    :param d_included: a dict, as returned by res.json().get("included", {})
    :type d_raw: dict

    :return: Post old string. Example: '2 mo'
    :rtype: str
    """
    return safe_dict_get(d_included, "actor", "subDescription", "text", default="")


def get_update_content(d_included: Dict, base_url: str) -> str:
    """Parse a dict and returns, if present, the post content

    :param d_included: a dict, as returned by res.json().get("included", {})
    :type d_included: dict
    :param base_url: site URL
    :type base_url: str

    :return: Post content
    :rtype: str
    """
    content = safe_dict_get(d_included, "commentary", "text", "text", default=None)
    if content:
        return content

    # Let's see if its a reshared post...
    reshared_update = safe_dict_get(d_included, "*resharedUpdate", default=None)
    if reshared_update:
        try:
            urn = get_urn_from_raw_update(reshared_update)
            return f"{base_url}/feed/update/{urn}"
        except (KeyError, TypeError, IndexError):
            pass

    return "IMAGE"


def get_update_author_profile(d_included: Dict, base_url: str) -> str:
    """Parse a dict and returns, if present, the URL corresponding the profile

    :param d_included: a dict, as returned by res.json().get("included", {})
    :type d_included: dict
    :param base_url: site URL
    :type base_url: str

    :return: URL with either company or member profile
    :rtype: str
    """
    urn = safe_dict_get(d_included, "actor", "urn", default="")
    if not urn:
        return ""

    urn_id = urn.split(":")[-1]
    if "company" in urn:
        return f"{base_url}/company/{urn_id}"
    elif "member" in urn:
        return f"{base_url}/in/{urn_id}"

    return urn


def get_update_url(d_included: Dict, base_url: str) -> str:
    """Parse a dict and returns, if present, the post URL

    :param d_included: a dict, as returned by res.json().get("included", {})
    :type d_included: dict
    :param base_url: site URL
    :type base_url: str

    :return: post url
    :rtype: str
    """
    urn = safe_dict_get(d_included, "updateMetadata", "urn", default="")
    if urn:
        return f"{base_url}/feed/update/{urn}"
    return ""


def append_update_post_field_to_posts_list(
    d_included: Dict, l_posts: List, post_key: str, post_value: str
) -> List[Dict]:
    """Parse a dict and returns, if present, the desired value. Finally it
    updates an already existing dict in the list or add a new dict to it

    :param d_included: a dict, as returned by res.json().get("included", {})
    :type d_raw: dict
    :param l_posts: a list with dicts
    :type l_posts: list
    :param post_key: the post field name to extract. Example: 'author_name'
    :type post_key: str
    :param post_value: the post value correspoding to post_key
    :type post_value: str

    :return: post list
    :rtype: list
    """
    elements_current_index = len(l_posts) - 1

    if elements_current_index == -1:
        l_posts.append({post_key: post_value})
    else:
        if not post_key in l_posts[elements_current_index]:
            l_posts[elements_current_index][post_key] = post_value
        else:
            l_posts.append({post_key: post_value})
    return l_posts


def parse_list_raw_urns(l_raw_urns: List[str]) -> List[str]:
    """Iterates a list containing posts URNS and retrieves list of URNs

    :param l_raw_urns: List containing posts URNs
    :type l_raw_posts: list

    :return: List of URNs
    :rtype: list
    """
    l_urns = []
    for i in l_raw_urns:
        l_urns.append(get_urn_from_raw_update(i))
    return l_urns


def parse_list_raw_posts(l_raw_posts: List[Dict], linkedin_base_url: str) -> List[Dict]:
    """Iterates a unsorted list containing post fields and assemble a
    list of dicts, each one of them contains a post

    :param l_raw_posts: Unsorted list containing posts information
    :type l_raw_posts: list
    :param linkedin_base_url: Linkedin URL
    :type linkedin_base_url: str

    :return: List of dicts, each one of them is a post
    :rtype: list
    """
    l_posts = []
    for i in l_raw_posts:
        author_name = get_update_author_name(i)
        if author_name:
            l_posts = append_update_post_field_to_posts_list(
                i, l_posts, "author_name", author_name
            )

        author_profile = get_update_author_profile(i, linkedin_base_url)
        if author_profile:
            l_posts = append_update_post_field_to_posts_list(
                i, l_posts, "author_profile", author_profile
            )

        old = get_update_old(i)
        if old:
            l_posts = append_update_post_field_to_posts_list(i, l_posts, "old", old)

        content = get_update_content(i, linkedin_base_url)
        if content:
            l_posts = append_update_post_field_to_posts_list(
                i, l_posts, "content", content
            )

        url = get_update_url(i, linkedin_base_url)
        if url:
            l_posts = append_update_post_field_to_posts_list(i, l_posts, "url", url)

    return l_posts


def get_list_posts_sorted_without_promoted(
    l_urns: List[str], l_posts: List[Dict]
) -> List[Dict]:
    """Iterates l_urns and looks for corresponding dicts in l_posts matching 'url' key.
    If found, removes this dict from l_posts and appends it to the returned list of posts

    :param l_urns: List of posts URNs
    :type l_urns: list
    :param l_posts: List of dicts, which each of them is a post
    :type l_posts: list

    :return: List of dicts, each one of them is a post
    :rtype: list
    """
    l_posts_sorted_without_promoted = []
    l_posts[:] = [d for d in l_posts if d and "Promoted" not in d.get("old", "")]
    for urn in l_urns:
        for post in l_posts:
            if urn in post["url"]:
                l_posts_sorted_without_promoted.append(post)
                l_posts[:] = [d for d in l_posts if urn not in d.get("url", "")]
                break
    return l_posts_sorted_without_promoted


def generate_trackingId_as_charString() -> str:
    """Generates and returns a random trackingId

    :return: Random trackingId string
    :rtype: str
    """
    random_int_array = [random.randrange(256) for _ in range(16)]
    rand_byte_array = bytearray(random_int_array)
    return "".join([chr(i) for i in rand_byte_array])


def generate_trackingId() -> str:
    """Generates and returns a random trackingId

    :return: Random trackingId string
    :rtype: str
    """
    random_int_array = [random.randrange(256) for _ in range(16)]
    rand_byte_array = bytearray(random_int_array)
    return str(base64.b64encode(rand_byte_array))[2:-1]


def extract_profile_section(
    profile: Dict,
    view_key: str,
    profile_key: str,
    nested_group_key: Optional[str] = None,
) -> List[Dict]:
    """
    Extract a section from a LinkedIn profile with support for multiple data formats.

    This function eliminates duplication in profile section extraction by handling
    the two common patterns used in LinkedIn API responses:
    1. Direct view with elements: profile[view_key]["elements"]
    2. Profile key with nested elements: profile[profile_key]["*elements"]
    3. Optional: Nested groups (for experience)

    :param profile: Profile data dictionary
    :param view_key: Key for the view format (e.g., "*positionView")
    :param profile_key: Key for the profile format (e.g., "profilePositionGroups")
    :param nested_group_key: Optional nested key for grouped data (e.g., "profilePositionInPositionGroup")
    :return: List of section elements or empty list

    Example:
        # Extract education
        education = extract_profile_section(profile, "*educationView", "profileEducations")

        # Extract experience (with nested groups)
        experience = extract_profile_section(
            profile, "*positionView", "profilePositionGroups", "profilePositionInPositionGroup"
        )
    """
    result = []

    # Try view format first
    view_data = safe_dict_get(profile, view_key, "elements", default=None)
    if view_data:
        return view_data

    # Try profile format
    profile_data = safe_dict_get(profile, profile_key, "*elements", default=None)
    if profile_data:
        # If there's a nested group key, we need to extract from groups
        if nested_group_key:
            for group in profile_data:
                nested_items = safe_dict_get(
                    group, nested_group_key, "*elements", default=[]
                )
                result.extend(nested_items)
            return result
        return profile_data

    return result
