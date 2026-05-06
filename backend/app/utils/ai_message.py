"""
Generate personalized messages using Google Gemini 2.5 Flash (free tier).
"""

import logging
import time
import threading
from collections import deque
import requests
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"


def validate_gemini_key(api_key: str, timeout: int = 10) -> dict:
    """Test a Gemini API key with a minimal call. Returns
        {"valid": bool, "reason": str}.
    Doesn't consume meaningful quota — uses a 5-token max prompt.
    """
    api_key = (api_key or "").strip()
    if not api_key:
        return {"valid": False, "reason": "empty"}
    try:
        resp = requests.post(
            f"{GEMINI_URL}?key={api_key}",
            json={
                "contents": [{"parts": [{"text": "ping"}]}],
                "generationConfig": {"maxOutputTokens": 5, "temperature": 0},
            },
            timeout=timeout,
        )
    except requests.RequestException as exc:
        return {"valid": False, "reason": f"network: {exc}"}

    if resp.status_code == 200:
        return {"valid": True, "reason": "ok"}
    if resp.status_code in (401, 403):
        return {"valid": False, "reason": "invalid_key"}
    if resp.status_code == 400:
        # 400 INVALID_ARGUMENT can mean either a bad key OR a bad prompt /
        # content policy hit. Only flag the key invalid when Google's error
        # message explicitly says so.
        if _is_invalid_key_error(resp):
            return {"valid": False, "reason": "invalid_key"}
        # Otherwise it's a transient request issue — accept the key.
        return {"valid": True, "reason": "ok"}
    if resp.status_code == 429:
        # Key works but quota already burned — tell the user, don't reject.
        return {"valid": True, "reason": "quota_exceeded"}
    if resp.status_code >= 500:
        # Gemini is down. Not the user's fault — accept the key.
        return {"valid": True, "reason": "gemini_unavailable"}
    return {"valid": False, "reason": f"http_{resp.status_code}"}


def _is_invalid_key_error(resp) -> bool:
    """Inspect a Gemini 400 response to tell key-related errors apart from
    transient prompt/content issues. Returns True only when Google's message
    explicitly mentions the API key being invalid."""
    try:
        body = resp.json()
    except Exception:
        return False
    err = (body or {}).get("error", {}) if isinstance(body, dict) else {}
    msg = (err.get("message") or "").lower()
    status = (err.get("status") or "").upper()
    # Real auth signals from Google
    if "api key not valid" in msg or "api_key_invalid" in msg:
        return True
    if status == "UNAUTHENTICATED" or status == "PERMISSION_DENIED":
        return True
    return False

# ---------------------------------------------------------------------------
# Rate limiter — 14 RPM max to stay safely under Google free tier (15 RPM)
# ---------------------------------------------------------------------------
_rate_lock = threading.Lock()
_request_timestamps: deque = deque()
_MAX_RPM = 14  # stay 1 under the 15 RPM limit


def _wait_for_rate_limit():
    """Block until we can make a request without exceeding 14 RPM."""
    with _rate_lock:
        now = time.monotonic()
        # Remove timestamps older than 60s
        while _request_timestamps and _request_timestamps[0] < now - 60:
            _request_timestamps.popleft()
        if len(_request_timestamps) >= _MAX_RPM:
            wait = 60 - (now - _request_timestamps[0]) + 0.5
            if wait > 0:
                logger.info(f"[RATE LIMIT] Waiting {wait:.1f}s to stay under {_MAX_RPM} RPM")
                time.sleep(wait)
        _request_timestamps.append(time.monotonic())


class GeminiAuthError(Exception):
    """Raised when Gemini rejects the API key (401/403)."""


class GeminiOverloadedError(Exception):
    """Raised when Gemini is overloaded (503) after all retries exhausted."""


# ---------------------------------------------------------------------------
# 3-strike auth-failure tracking — don't trash the key on a single transient
# error (network blip, content filter on one prospect's headline, etc).
# In-memory; survives within a process. After a restart we re-count from 0,
# which is fine: at worst we tolerate 3 more strikes before flagging.
# ---------------------------------------------------------------------------
_consecutive_auth_failures: Dict[int, int] = {}
AUTH_FAILURE_THRESHOLD = 3


def record_gemini_auth_failure(user_id: int) -> int:
    """Increment auth-failure counter. Returns the new count."""
    if not user_id:
        return 0
    _consecutive_auth_failures[user_id] = _consecutive_auth_failures.get(user_id, 0) + 1
    count = _consecutive_auth_failures[user_id]
    logger.warning("[GEMINI] Auth failure %d/%d for user %d", count, AUTH_FAILURE_THRESHOLD, user_id)
    return count


def record_gemini_success(user_id: int) -> None:
    """Reset auth-failure counter after a successful Gemini call."""
    if user_id and user_id in _consecutive_auth_failures:
        _consecutive_auth_failures.pop(user_id, None)


def should_invalidate_gemini_key(user_id: int) -> bool:
    """True when consecutive auth failures hit the threshold."""
    return _consecutive_auth_failures.get(user_id, 0) >= AUTH_FAILURE_THRESHOLD


def mark_gemini_key_invalid(user_id: int) -> None:
    """Flag the user's Gemini key as invalid: NULL the key, set the
    'gemini_key_invalid' AppSettings flag (drives the dashboard popup),
    pause running AI campaigns, and drop a Notification.
    Safe to call from any campaign job — uses its own DB session."""
    from app.database import SessionLocal
    from app.models import User, Campaign, Notification
    from app.utils.settings import set_setting
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user_id).first()
        if not u:
            return
        if u.gemini_api_key:
            u.gemini_api_key = None
        # Trigger the GeminiBlockerModal on the user's dashboard
        set_setting(db, user_id, "gemini_key_invalid", "true")
        # Pause running campaigns that depend on AI
        running_ai = db.query(Campaign).filter(
            Campaign.user_id == user_id,
            Campaign.status == "running",
            Campaign.use_ai == True,  # noqa: E712
        ).all()
        for c in running_ai:
            c.status = "paused"
            c.error_message = "Clé Gemini invalide — recollez-la dans Configuration."
        db.add(Notification(
            user_id=user_id,
            type="warning",
            title="Clé Gemini invalide",
            message="Google a rejeté votre clé. Recollez-la dans Configuration → IA pour reprendre vos campagnes IA.",
            read=False,
        ))
        db.commit()
    finally:
        db.close()


def _gemini_post(
    json_body: dict,
    timeout: int = 30,
    api_key: str = "",
    fail_fast: bool = False,
) -> requests.Response:
    """POST to Gemini with rate limiting and retry on 429/503.

    fail_fast=True: 1 attempt only, no retry on 503 (used for interactive
    previews where the user is waiting and would rather see a fast error
    than a 30-60s spinner). Default False = up to 3 attempts.

    Raises GeminiAuthError on 401/403 so callers can mark the user's key invalid
    and surface a banner in the UI. Raises GeminiOverloadedError when 503 retries
    are exhausted (or immediately if fail_fast=True).
    """
    if not api_key:
        raise ValueError("Gemini API key missing: user must configure their own key in settings")
    key = api_key
    max_attempts = 1 if fail_fast else 3
    for attempt in range(max_attempts):
        _wait_for_rate_limit()
        resp = requests.post(
            f"{GEMINI_URL}?key={key}",
            json=json_body,
            timeout=timeout,
        )
        if resp.status_code in (401, 403):
            raise GeminiAuthError(f"Gemini rejected the API key (HTTP {resp.status_code})")
        if resp.status_code == 400:
            # 400 INVALID_ARGUMENT can be many things — only blame the user's
            # key when Google's error message explicitly says it's invalid.
            # Otherwise let the call fall through to the generic exception
            # path so the campaign uses its fallback message and we DON'T
            # strike the user's key for what is likely a Gemini bug.
            if _is_invalid_key_error(resp):
                raise GeminiAuthError("Gemini rejected the API key (400 INVALID_ARGUMENT)")
            # Surface as a generic HTTPError; callers' generic except branch
            # will fall back to the template / fallback message.
            resp.raise_for_status()
            return resp
        if resp.status_code == 429:
            if fail_fast:
                break
            wait = 10 if attempt == 0 else 20
            logger.info(f"[GEMINI] 429 received, retrying in {wait}s (attempt {attempt + 1}/3)")
            time.sleep(wait)
            continue
        if resp.status_code >= 500:
            # 500/502/503/504 are all Gemini-side issues — never the user's key.
            if fail_fast:
                break
            wait = 5 * (attempt + 1)  # 5s, 10s, 15s
            logger.info(f"[GEMINI] {resp.status_code} received, retrying in {wait}s (attempt {attempt + 1}/3)")
            time.sleep(wait)
            continue
        return resp
    # Exhausted retries on 5xx — surface a typed error so callers can return a
    # clean 503 to the UI instead of a generic 500, and so they DON'T count
    # this as a strike against the user's key.
    if resp.status_code >= 500:
        raise GeminiOverloadedError(f"Gemini is unavailable (HTTP {resp.status_code})")
    return resp


# ---------------------------------------------------------------------------
# Profile data helpers
# ---------------------------------------------------------------------------

def _format_experience(experience: List[Dict]) -> str:
    if not experience:
        return ""
    lines = []
    for exp in experience[:3]:
        title = exp.get("title") or ""
        company = exp.get("companyName") or ""
        desc = exp.get("description") or ""
        if title or company:
            line = f"- {title} chez {company}" if company else f"- {title}"
            if desc:
                line += f" ({desc[:150]})" if len(desc) > 150 else f" ({desc})"
            lines.append(line)
    return "\n".join(lines)


def _format_education(education: List[Dict]) -> str:
    if not education:
        return ""
    lines = []
    for edu in education[:2]:
        school = edu.get("schoolName") or ""
        degree = edu.get("degreeName") or ""
        field = edu.get("fieldOfStudy") or ""
        if school:
            line = f"- {degree} {field} - {school}" if degree else f"- {school}"
            lines.append(line.strip())
    return "\n".join(lines)


def _is_repost(post: Dict) -> bool:
    """Detect if a post element is a reshare/repost (not original content)."""
    # Check for resharedUpdate field (common repost indicator)
    if post.get("resharedUpdate"):
        return True
    # Check updateMetadata for RESHARED action type
    metadata = post.get("updateMetadata", {})
    if isinstance(metadata, dict):
        actions = metadata.get("updateActions", {})
        if isinstance(actions, dict):
            for action in actions.get("actions", []):
                if isinstance(action, dict) and action.get("actionType") == "RESHARE":
                    return True
    # Check header text for repost indicators (e.g. "X a republié ceci")
    header = post.get("header", {})
    if isinstance(header, dict):
        text = header.get("text", {}).get("text", "") if isinstance(header.get("text"), dict) else ""
        for keyword in ["republié", "reposted", "a partagé", "shared"]:
            if keyword.lower() in text.lower():
                return True
    return False


def extract_post_texts(raw_posts: List[Dict]) -> List[str]:
    """Extract text content from raw LinkedIn post elements.

    Skips pure reposts (no personal commentary). For reposts with added
    commentary, only the person's own comment is extracted.
    """
    texts = []
    for post in raw_posts:
        try:
            is_repost = _is_repost(post)

            commentary = post.get("commentary", {})
            if commentary:
                text = commentary.get("commentaryText", {}).get("text", "")
                if text and len(text) > 20:
                    # For reposts with commentary, the commentary is the person's own words
                    texts.append(text[:500])
                    continue
                elif is_repost:
                    # Repost without personal commentary — skip entirely
                    continue

            # Skip reposts that didn't have commentary above
            if is_repost:
                continue

            value = post.get("value", {})
            if isinstance(value, dict):
                content = value.get("content", {}) or value.get("com.linkedin.voyager.feed.render.UpdateV2", {})
                if isinstance(content, dict):
                    commentary2 = content.get("commentary", {})
                    if commentary2:
                        text = commentary2.get("text", {}).get("text", "")
                        if text and len(text) > 20:
                            texts.append(text[:500])
                            continue
            header = post.get("header", {})
            if isinstance(header, dict):
                text = header.get("text", {}).get("text", "")
                if text and len(text) > 20:
                    texts.append(text[:500])
        except Exception:
            continue
    return texts[:3]


def _build_profile_context(
    contact: Dict[str, Any],
    profile_data: Optional[Dict[str, Any]] = None,
    recent_posts: Optional[List[str]] = None,
) -> str:
    """Build a rich text block describing a contact for AI consumption."""
    first_name = contact.get("first_name") or ""
    last_name = contact.get("last_name") or ""
    headline = contact.get("headline") or ""
    location = contact.get("location") or ""

    parts = [f"Prenom: {first_name}", f"Nom: {last_name}"]
    if headline:
        parts.append(f"Titre LinkedIn: {headline}")
    if location:
        parts.append(f"Localisation: {location}")

    if profile_data:
        summary = profile_data.get("summary") or ""
        experience = _format_experience(profile_data.get("experience") or [])
        education = _format_education(profile_data.get("education") or [])
        skills = profile_data.get("skills") or []
        skill_names = ", ".join(s.get("name", "") for s in skills[:8] if s.get("name"))

        if summary:
            parts.append(f"\nBio:\n{summary[:400]}")
        if experience:
            parts.append(f"\nExperience:\n{experience}")
        if education:
            parts.append(f"\nFormation:\n{education}")
        if skill_names:
            parts.append(f"\nCompetences: {skill_names}")

    if recent_posts:
        posts_text = "\n---\n".join(recent_posts[:2])
        parts.append(f"\nDerniers posts LinkedIn:\n{posts_text}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# {compliment} generation
# ---------------------------------------------------------------------------

def generate_compliment(
    contact: Dict[str, Any],
    profile_data: Optional[Dict[str, Any]] = None,
    recent_posts: Optional[List[str]] = None,
    context_text: str = "",
    ai_prompt: str = "",
    api_key: str = "",
) -> str:
    """Generate a personalized compliment/icebreaker for a contact.

    This produces a short, natural sentence (1-2 lines) that references
    something specific from the person's profile, experience, or posts.
    Used as the {compliment} variable in message templates.
    """
    profile_context = _build_profile_context(contact, profile_data, recent_posts)

    context_section = ""
    if context_text:
        context_section = f"\nContexte de la campagne/produit:\n{context_text}\n"

    prompt_section = ""
    if ai_prompt:
        prompt_section = f"\nInstructions supplementaires de l'utilisateur:\n{ai_prompt}\n"

    prompt = f"""PROFIL DU DESTINATAIRE:
{profile_context}
{context_section}{prompt_section}
MISSION: Ecris une phrase d'accroche personnalisee (1-2 lignes max) pour cette personne.

REGLES:
- Base-toi sur un element PRECIS et UNIQUE de son profil: un poste recent, une transition de carriere, une competence rare, un sujet de post, son parcours academique...
- NE COPIE JAMAIS son titre LinkedIn mot pour mot. Pas de "votre profil de [titre]" ou "en tant que [titre]"
- La phrase doit montrer que tu as VRAIMENT regarde son profil, pas juste lu son titre
- Sois naturel et conversationnel, comme si tu parlais a un collegue
- Si des posts sont disponibles, c'est le MEILLEUR angle d'accroche (mentionne le sujet)
- Pas de guillemets autour de la reponse
- Ecris UNIQUEMENT la phrase d'accroche, rien d'autre

EXEMPLES DE BON RESULTAT:
- "j'ai vu que vous etes passe du conseil en strategie a la tech - ce genre de parcours est rare et ca apporte une vision business que peu de fondateurs ont"
- "votre post sur l'automatisation des process commerciaux m'a parle, c'est exactement le sujet sur lequel je travaille en ce moment"
- "apres 8 ans chez L'Oreal et maintenant a la tete de votre propre structure, vous devez avoir une vision claire de ce qui manque aux outils actuels"
"""

    try:
        resp = _gemini_post({
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {
                    "parts": [{"text": (
                        "Tu es un expert en prospection LinkedIn. Tu ecris des phrases d'accroche "
                        "hyper-personnalisees basees sur le profil reel de la personne. "
                        "Tu ne repetes JAMAIS le titre LinkedIn. Tu trouves un angle unique. "
                        "Tu ecris comme un humain. Tu reponds avec une seule phrase d'accroche."
                    )}]
                },
            }, timeout=30, api_key=api_key)
        resp.raise_for_status()
        data = resp.json()
        compliment = data["candidates"][0]["content"]["parts"][0]["text"].strip()

        # Clean up quotes
        for q in [('"', '"'), ('\u00ab', '\u00bb'), ('\u201c', '\u201d')]:
            if compliment.startswith(q[0]) and compliment.endswith(q[1]):
                compliment = compliment[1:-1]

        # Remove leading dash/bullet if present
        compliment = compliment.lstrip("- ").strip()

        return compliment

    except (GeminiAuthError, GeminiOverloadedError):
        raise
    except Exception:
        logger.exception("Error generating compliment with Gemini")
        return ""


# ---------------------------------------------------------------------------
# Full message generation (for manual CRM use)
# ---------------------------------------------------------------------------

def generate_personalized_message(
    base_prompt: str,
    contact: Dict[str, Any],
    max_length: int = 2000,
    profile_data: Optional[Dict[str, Any]] = None,
    recent_posts: Optional[List[str]] = None,
    api_key: str = "",
) -> str:
    """Generate a full personalized message (used from CRM contact card)."""
    profile_context = _build_profile_context(contact, profile_data, recent_posts)

    prompt = f"""PROFIL DU DESTINATAIRE:
{profile_context}

INSTRUCTIONS DE L'UTILISATEUR:
{base_prompt}

REGLES:
- Ecris UNIQUEMENT le message final, rien d'autre
- NE COPIE JAMAIS mot pour mot le titre ou la bio du destinataire
- Fais reference a un ASPECT PRECIS de son parcours (experience, competence, post recent)
- Le message doit sembler ecrit par un humain qui a regarde le profil
- Sois concis et naturel
- Max {max_length} caracteres"""

    try:
        resp = _gemini_post({
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {
                    "parts": [{"text": (
                        "Tu es un expert en prospection LinkedIn. Tu ecris des messages "
                        "hyper-personnalises. Tu ne repetes JAMAIS le titre LinkedIn mot pour mot. "
                        "Tu trouves un angle unique base sur le parcours reel. "
                        "Tu reponds uniquement avec le message final."
                    )}]
                },
            }, timeout=30, api_key=api_key)
        resp.raise_for_status()
        data = resp.json()
        message = data["candidates"][0]["content"]["parts"][0]["text"].strip()

        for q in [('"', '"'), ('\u00ab', '\u00bb')]:
            if message.startswith(q[0]) and message.endswith(q[1]):
                message = message[1:-1]

        if len(message) > max_length:
            message = message[:max_length - 3] + "..."

        return message.strip()

    except (GeminiAuthError, GeminiOverloadedError):
        raise
    except Exception:
        logger.exception("Error generating AI message with Gemini")
        return ""


# ---------------------------------------------------------------------------
# Full personalization: AI writes entire message(s) per contact
# ---------------------------------------------------------------------------

def generate_full_personalized_messages(
    contact: Dict[str, Any],
    profile_data: Optional[Dict[str, Any]] = None,
    recent_posts: Optional[List[str]] = None,
    context_text: str = "",
    ai_prompt: str = "",
    followup_count: int = 0,
    followup_delays: Optional[List[int]] = None,
    api_key: str = "",
    fail_fast: bool = False,
) -> List[Dict[str, Any]]:
    """Generate complete message(s) from scratch for one contact.

    Returns a list of dicts with keys: sequence, rendered, delay_days.
    """
    profile_context = _build_profile_context(contact, profile_data, recent_posts)

    followup_section = ""
    if followup_count > 0:
        delay_info = []
        for i in range(followup_count):
            days = followup_delays[i] if followup_delays and i < len(followup_delays) else (i + 1) * 2
            delay_info.append(f"  Relance {i + 1}: envoyee {days} jours apres le message precedent")
        followup_section = (
            f"\nGenere aussi {followup_count} message(s) de relance pour les personnes qui n'ont pas repondu:\n"
            + "\n".join(delay_info)
            + "\nChaque relance doit faire reference au message precedent naturellement et apporter un angle nouveau."
        )

    context_section = ""
    if context_text:
        context_section = f"\nContexte de la campagne/produit/service:\n{context_text}\n"

    prompt = f"""PROFIL COMPLET DU DESTINATAIRE:
{profile_context}
{context_section}
INSTRUCTIONS DE L'UTILISATEUR:
{ai_prompt}

MISSION: Ecris un message LinkedIn principal 100% personnalise pour cette personne.{followup_section}

REGLES:
- Le message doit etre ENTIEREMENT personnalise en fonction du profil de la personne
- NE COPIE JAMAIS son titre LinkedIn mot pour mot
- Reference des elements PRECIS: un poste, une experience, un post, une competence
- Suis les instructions de l'utilisateur a la lettre (ton, objectif, longueur)
- Sois naturel, comme un vrai humain qui a pris le temps de regarder le profil
- Ecris UNIQUEMENT les messages, pas de commentaire

FORMAT OBLIGATOIRE (separe chaque message par ---MESSAGE---):
SEQUENCE:0
CONTENT:
<message principal>
---MESSAGE---
SEQUENCE:1
CONTENT:
<relance 1>
---MESSAGE---
(etc.)"""

    try:
        resp = _gemini_post({
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {
                    "parts": [{"text": (
                        "Tu es un expert en prospection LinkedIn. Tu ecris des messages "
                        "entierement personnalises base sur le profil reel du destinataire. "
                        "Tu ne repetes JAMAIS le titre LinkedIn. Tu trouves des angles uniques. "
                        "Tu suis les instructions de l'utilisateur. Tu reponds uniquement avec les messages formates."
                    )}]
                },
            }, timeout=45, api_key=api_key, fail_fast=fail_fast)
        resp.raise_for_status()
        data = resp.json()
        raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()

        messages = []
        blocks = raw_text.split("---MESSAGE---")
        default_delays = [0] + [
            followup_delays[i] if followup_delays and i < len(followup_delays) else (i + 1) * 2
            for i in range(followup_count)
        ]

        for block in blocks:
            block = block.strip()
            if not block:
                continue
            seq = 0
            content = block
            for line in block.split("\n"):
                ls = line.strip()
                if ls.startswith("SEQUENCE:"):
                    try:
                        seq = int(ls.split(":", 1)[1].strip())
                    except ValueError:
                        pass
                    break
            if "CONTENT:" in block:
                content = block.split("CONTENT:", 1)[1].strip()

            delay = default_delays[seq] if seq < len(default_delays) else 0
            messages.append({"sequence": seq, "rendered": content, "delay_days": delay})

        messages.sort(key=lambda m: m["sequence"])
        return messages if messages else [{"sequence": 0, "rendered": "", "delay_days": 0}]

    except (GeminiAuthError, GeminiOverloadedError):
        raise
    except Exception:
        logger.exception("Error generating full personalized messages")
        return [{"sequence": 0, "rendered": "", "delay_days": 0}]


# ---------------------------------------------------------------------------
# Campaign template generation
# ---------------------------------------------------------------------------

def generate_campaign_messages(
    ai_prompt: str,
    context_text: str = "",
    followup_count: int = 0,
    followup_delays: list = [],
    api_key: str = "",
) -> list:
    """Generate main + follow-up message templates using Gemini."""

    followup_section = ""
    if followup_count > 0:
        delay_info = []
        for i in range(followup_count):
            days = followup_delays[i] if i < len(followup_delays) else (i + 1) * 2
            delay_info.append(f"  Follow-up {i + 1}: sent {days} days after the previous message")
        followup_section = (
            f"\nAlso generate {followup_count} follow-up message(s) for people who did not reply:\n"
            + "\n".join(delay_info)
            + "\nEach follow-up should reference the previous message naturally and add new value."
        )

    context_section = ""
    if context_text:
        context_section = f"\nContext about the campaign/product/service:\n{context_text}\n"

    prompt = f"""Generate LinkedIn DM message templates for a campaign.

Instructions from the user: {ai_prompt}
{context_section}
Available placeholders: {{first_name}}, {{last_name}}, {{headline}}, {{compliment}}

IMPORTANT about {{compliment}}: This placeholder will be replaced at send-time with a personalized
icebreaker sentence generated from each contact's full LinkedIn profile (bio, experience, posts).
Use {{compliment}} where you want the personalized hook to appear. Do NOT write a generic compliment
yourself - just put {{compliment}} and the AI will fill it per-contact.

Generate 1 main message (sequence 0).{followup_section}

Format your response EXACTLY as follows, with each message separated by "---MESSAGE---":
SEQUENCE:0
CONTENT:
<the main message text>
---MESSAGE---
SEQUENCE:1
CONTENT:
<follow-up 1 text>
---MESSAGE---
(and so on for each follow-up)

Write ONLY the formatted messages, nothing else."""

    try:
        resp = _gemini_post({
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {
                    "parts": [{"text": "You write LinkedIn DM templates. The user gives you instructions and context. You follow their instructions precisely. You respond only with the formatted messages, no explanations or commentary."}]
                },
            }, timeout=60, api_key=api_key)
        resp.raise_for_status()
        data = resp.json()
        raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()

        messages = []
        blocks = raw_text.split("---MESSAGE---")

        default_delays = [0] + [
            followup_delays[i] if i < len(followup_delays) else (i + 1) * 2
            for i in range(followup_count)
        ]

        for block in blocks:
            block = block.strip()
            if not block:
                continue

            seq = 0
            content = block

            for line in block.split("\n"):
                line_stripped = line.strip()
                if line_stripped.startswith("SEQUENCE:"):
                    try:
                        seq = int(line_stripped.split(":", 1)[1].strip())
                    except ValueError:
                        pass
                    break

            if "CONTENT:" in block:
                content = block.split("CONTENT:", 1)[1].strip()

            delay = default_delays[seq] if seq < len(default_delays) else 0

            messages.append({
                "sequence": seq,
                "message_template": content,
                "delay_days": delay,
            })

        messages.sort(key=lambda m: m["sequence"])

        if not messages:
            logger.warning("Gemini returned no parseable messages")
            return []

        return messages

    except (GeminiAuthError, GeminiOverloadedError):
        raise
    except Exception:
        logger.exception("Error generating campaign messages with Gemini")
        return []


def is_ollama_available(api_key: str = "") -> bool:
    """Check if Gemini API is available."""
    try:
        resp = _gemini_post(
            {"contents": [{"parts": [{"text": "ok"}]}]},
            timeout=10,
            api_key=api_key,
        )
        return resp.ok
    except Exception:
        return False
