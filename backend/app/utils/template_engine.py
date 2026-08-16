"""
Template engine for personalizing campaign messages.

Substitutes placeholders like {first_name}, {last_name}, {headline}, {company}
with actual contact data.
"""

import re
from typing import Any, Dict


_PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")

# Supported template variables and their fallback defaults.
_DEFAULTS: Dict[str, str] = {
    "first_name": "there",
    "last_name": "",
    "headline": "",
    "company": "",
    "location": "",
    "name": "there",
    "compliment": "",
}


def render_template(template: str, contact: Dict[str, Any]) -> str:
    """Render a message template by substituting placeholders with contact data.

    Supported placeholders: {first_name}, {last_name}, {headline}, {company},
    {location}, {name}.

    If a placeholder has no matching contact field, a sensible default is used
    (e.g. "there" for {first_name}).

    :param template: The message template string with {placeholders}.
    :param contact: A dict of contact fields (keys may come from the Contact model
                    or directly from LinkedIn profile data).
    :return: The rendered message string.
    """
    if not template:
        return ""

    # Build a normalized lookup from the contact dict.  Accept both
    # snake_case model fields and camelCase LinkedIn API fields.
    lookup: Dict[str, str] = {}
    lookup["first_name"] = (
        contact.get("first_name")
        or contact.get("firstName")
        or _DEFAULTS["first_name"]
    )
    lookup["last_name"] = (
        contact.get("last_name")
        or contact.get("lastName")
        or _DEFAULTS["last_name"]
    )
    lookup["headline"] = (
        contact.get("headline") or _DEFAULTS["headline"]
    )
    lookup["company"] = (
        _extract_company(contact) or _DEFAULTS["company"]
    )
    lookup["location"] = (
        contact.get("location")
        or contact.get("locationName")
        or _DEFAULTS["location"]
    )
    lookup["name"] = (
        f"{lookup['first_name']} {lookup['last_name']}".strip()
        or _DEFAULTS["name"]
    )
    lookup["compliment"] = (
        contact.get("compliment") or _DEFAULTS["compliment"]
    )

    def _replace(match: re.Match) -> str:
        key = match.group(1)
        return lookup.get(key, match.group(0))  # leave unknown placeholders as-is

    return _PLACEHOLDER_RE.sub(_replace, template)


def _extract_company(contact: Dict[str, Any]) -> str:
    """Try to extract a company name from various contact data shapes."""
    # Direct field
    if contact.get("company"):
        return contact["company"]

    # From headline — common format: "Title at Company"
    headline = contact.get("headline") or ""
    if " at " in headline:
        return headline.split(" at ", 1)[1].strip()

    # From jobtitle (search result format): "Title at Company"
    jobtitle = contact.get("jobtitle") or ""
    if " at " in jobtitle:
        return jobtitle.split(" at ", 1)[1].strip()

    # From experience list (full profile)
    experience = contact.get("experience")
    if isinstance(experience, list) and experience:
        first = experience[0]
        if isinstance(first, dict):
            return first.get("companyName", "") or first.get("company", "")

    return ""
