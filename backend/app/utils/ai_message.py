"""
Generate personalized messages using Google Gemini 2.5 Flash (free tier).
"""

import logging
import requests
from typing import Dict, Any, List, Optional

from app.config import GEMINI_API_KEY

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"


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
        resp = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {
                    "parts": [{"text": (
                        "Tu es un expert en prospection LinkedIn. Tu ecris des phrases d'accroche "
                        "hyper-personnalisees basees sur le profil reel de la personne. "
                        "Tu ne repetes JAMAIS le titre LinkedIn. Tu trouves un angle unique. "
                        "Tu ecris comme un humain. Tu reponds avec une seule phrase d'accroche."
                    )}]
                },
            },
            timeout=30,
        )
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
        resp = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {
                    "parts": [{"text": (
                        "Tu es un expert en prospection LinkedIn. Tu ecris des messages "
                        "hyper-personnalises. Tu ne repetes JAMAIS le titre LinkedIn mot pour mot. "
                        "Tu trouves un angle unique base sur le parcours reel. "
                        "Tu reponds uniquement avec le message final."
                    )}]
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        message = data["candidates"][0]["content"]["parts"][0]["text"].strip()

        for q in [('"', '"'), ('\u00ab', '\u00bb')]:
            if message.startswith(q[0]) and message.endswith(q[1]):
                message = message[1:-1]

        if len(message) > max_length:
            message = message[:max_length - 3] + "..."

        return message.strip()

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
        resp = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {
                    "parts": [{"text": (
                        "Tu es un expert en prospection LinkedIn. Tu ecris des messages "
                        "entierement personnalises base sur le profil reel du destinataire. "
                        "Tu ne repetes JAMAIS le titre LinkedIn. Tu trouves des angles uniques. "
                        "Tu suis les instructions de l'utilisateur. Tu reponds uniquement avec les messages formates."
                    )}]
                },
            },
            timeout=45,
        )
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
        resp = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {
                    "parts": [{"text": "You write LinkedIn DM templates. The user gives you instructions and context. You follow their instructions precisely. You respond only with the formatted messages, no explanations or commentary."}]
                },
            },
            timeout=60,
        )
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

    except Exception:
        logger.exception("Error generating campaign messages with Gemini")
        return []


def is_ollama_available() -> bool:
    """Check if Gemini API is available."""
    try:
        resp = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json={"contents": [{"parts": [{"text": "ok"}]}]},
            timeout=10,
        )
        return resp.ok
    except Exception:
        return False
