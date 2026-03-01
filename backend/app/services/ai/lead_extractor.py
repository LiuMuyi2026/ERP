from sqlalchemy.ext.asyncio import AsyncSession
import logging

logger = logging.getLogger(__name__)


async def extract_lead_from_conversation(
    messages: list[dict],
    db: AsyncSession | None = None,
    tenant_id: str | None = None,
) -> dict:
    """Extract lead info from last 10 messages."""
    recent = messages[-10:]
    transcript = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in recent])

    prompt = f"""Analyze this conversation and extract lead information.

Transcript:
{transcript}

Return JSON:
{{
  "should_create_lead": boolean,
  "full_name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "company": "string or null",
  "title": "string or null",
  "confidence": 0.0-1.0
}}

Only set should_create_lead=true if you found a real person with at least a name."""

    try:
        from app.services.ai.provider import generate_json_for_tenant
        return await generate_json_for_tenant(db, tenant_id, prompt, "You are a CRM data extraction assistant. Return JSON only.")
    except Exception as e:
        logger.error(f"Lead extraction failed: {e}")
        return {"should_create_lead": False}
