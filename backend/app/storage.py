"""
File storage abstraction.

Uses Supabase Storage in production (when SUPABASE_URL is set),
falls back to local disk in development.
"""

import uuid
import logging
from pathlib import Path

import requests as http_requests

from app.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET, UPLOADS_DIR

logger = logging.getLogger(__name__)


def _use_supabase() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def upload_file(content: bytes, original_filename: str) -> str:
    """Upload a file and return its public URL/path.

    Returns a full URL (Supabase) or a relative path like /uploads/xxx.png (local).
    """
    ext = Path(original_filename).suffix or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"

    if _use_supabase():
        return _upload_supabase(content, filename, ext)
    else:
        return _upload_local(content, filename)


def _upload_supabase(content: bytes, filename: str, ext: str) -> str:
    """Upload to Supabase Storage and return the public URL."""
    content_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
    }.get(ext.lower(), "application/octet-stream")

    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{filename}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type,
    }

    resp = http_requests.post(url, data=content, headers=headers, timeout=30)

    if resp.status_code not in (200, 201):
        logger.error("Supabase upload failed: %s %s", resp.status_code, resp.text)
        # Fallback to local
        return _upload_local(content, filename)

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{filename}"
    logger.info("Uploaded to Supabase: %s", public_url)
    return public_url


def _upload_local(content: bytes, filename: str) -> str:
    """Save to local uploads directory."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOADS_DIR / filename
    dest.write_bytes(content)
    return f"/uploads/{filename}"
