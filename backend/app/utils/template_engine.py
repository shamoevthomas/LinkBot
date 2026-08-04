"""
Template engine for personalizing campaign messages.

Substitutes placeholders like {first_name}, {last_name}, {headline}, {company}
with actual contact data.
"""

import logging
import re
from typing import Any, Dict

logger = logging.getLogger(__name__)

_PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")

# French spellings for the same fields — the UI, the statuses and every
# user-facing string are in French, so these are what people actually type.
_FR_ALIASES: Dict[str, str] = {
    "prenom": "first_name",
    "prénom": "first_name",
    "nom": "last_name",
    "nom_complet": "name",
    "titre": "headline",
    "poste": "headline",
    "entreprise": "company",
    "societe": "company",
    "société": "company",
    "ville": "location",
    "localisation": "location",
}

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

    # The whole product is in French, so users naturally write {prenom} rather
    # than {first_name}. Unknown placeholders used to be left untouched and went
    # out to the prospect verbatim — a real message was delivered reading
    # "Hello {prenom},". Accept the French spellings, and never ship an
    # unresolved placeholder again.
    for alias, canonical in _FR_ALIASES.items():
        lookup[alias] = lookup[canonical]

    unknown: list[str] = []

    def _replace(match: re.Match) -> str:
        key = match.group(1)
        if key in lookup:
            return lookup[key]
        unknown.append(key)
        return ""  # drop it rather than send braces to a prospect

    rendered = _PLACEHOLDER_RE.sub(_replace, template)

    if unknown:
        logger.warning(
            "render_template: unknown placeholder(s) %s removed from message; "
            "supported: %s",
            ", ".join("{%s}" % k for k in dict.fromkeys(unknown)),
            ", ".join("{%s}" % k for k in sorted(_DEFAULTS)),
        )
        # Removing a placeholder leaves artefacts like "Bonjour ," or double
        # spaces — tidy them so the message still reads naturally.
        rendered = re.sub(r"[ \t]{2,}", " ", rendered)
        # Only ,/. take no leading space — French keeps one before ? ! : ;
        rendered = re.sub(r"[ \t]+([,.])", r"\1", rendered)
        rendered = re.sub(r"([,;:])[ \t]*([,.!?;:])", r"\2", rendered)
        rendered = re.sub(r"(?m)^[ \t]*[,;:][ \t]*", "", rendered)
        rendered = re.sub(r"[ \t]+$", "", rendered, flags=re.M)

    return rendered


def find_unknown_placeholders(template: str) -> list[str]:
    """Placeholders in `template` the engine cannot resolve.

    Lets callers warn at save time instead of discovering the problem in a
    message already delivered to a prospect.
    """
    if not template:
        return []
    known = set(_DEFAULTS) | set(_FR_ALIASES)
    return [k for k in dict.fromkeys(_PLACEHOLDER_RE.findall(template)) if k not in known]


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
