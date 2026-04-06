"""
CSV parser for importing contacts from uploaded CSV files.

Parses raw CSV content and maps columns to contact fields using a
user-provided column mapping.
"""

import csv
import io
from typing import Any, Dict, List, Optional


# The contact fields we recognize when importing.
VALID_CONTACT_FIELDS = {
    "urn_id",
    "public_id",
    "first_name",
    "last_name",
    "headline",
    "location",
    "profile_picture_url",
    "linkedin_url",
    "connection_status",
}


def parse_csv(
    file_content: str,
    column_mapping: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """Parse CSV content into a list of contact dicts.

    :param file_content: Raw CSV text (UTF-8).
    :param column_mapping: Optional dict mapping CSV column headers to contact
        field names.  Example: {"First Name": "first_name", "URL": "linkedin_url"}.
        If ``None``, column headers are lower-cased and spaces replaced with
        underscores to derive field names automatically.
    :return: A list of dicts, each representing a contact row.  Only keys in
        ``VALID_CONTACT_FIELDS`` are included.
    """
    # Strip BOM if present
    if file_content.startswith("\ufeff"):
        file_content = file_content[1:]

    # Auto-detect delimiter (comma vs semicolon)
    first_line = file_content.split("\n", 1)[0]
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","

    reader = csv.DictReader(io.StringIO(file_content), delimiter=delimiter)
    if reader.fieldnames is None:
        return []

    # Build effective mapping
    mapping: Dict[str, str] = {}
    if column_mapping:
        for csv_col, contact_field in column_mapping.items():
            if contact_field in VALID_CONTACT_FIELDS:
                mapping[csv_col] = contact_field
    else:
        # Auto-map: normalize header names
        for header in reader.fieldnames:
            normalized = header.strip().lower().replace(" ", "_").replace("-", "_")
            if normalized in VALID_CONTACT_FIELDS:
                mapping[header] = normalized

        # Handle common LinkedIn export column names
        _COMMON_ALIASES: Dict[str, str] = {
            "First Name": "first_name",
            "Last Name": "last_name",
            "URL": "linkedin_url",
            "Profile URL": "linkedin_url",
            "LinkedIn URL": "linkedin_url",
            "Email Address": "",  # not a contact field, skip
            "Company": "",
            "Position": "headline",
            "Headline": "headline",
            "Location": "location",
            "Connected On": "",
        }
        for csv_col, contact_field in _COMMON_ALIASES.items():
            if csv_col in reader.fieldnames and csv_col not in mapping and contact_field:
                if contact_field in VALID_CONTACT_FIELDS:
                    mapping[csv_col] = contact_field

    contacts: List[Dict[str, Any]] = []
    for row in reader:
        contact: Dict[str, Any] = {}
        for csv_col, contact_field in mapping.items():
            value = row.get(csv_col, "").strip()
            if value:
                contact[contact_field] = value

        # Skip rows that have no identifiable data
        if not contact:
            continue

        # Try to derive linkedin_url from public_id if missing
        if "linkedin_url" not in contact and "public_id" in contact:
            contact["linkedin_url"] = (
                f"https://www.linkedin.com/in/{contact['public_id']}"
            )

        # Try to extract public_id from linkedin_url if missing
        if "public_id" not in contact and "linkedin_url" in contact:
            url = contact["linkedin_url"]
            if "/in/" in url:
                public_id = url.rstrip("/").split("/in/")[-1].split("?")[0]
                if public_id:
                    contact["public_id"] = public_id

        contacts.append(contact)

    return contacts
