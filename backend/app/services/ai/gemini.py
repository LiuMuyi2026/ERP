import asyncio
import google.generativeai as genai
from typing import AsyncIterator
from app.config import settings
import json
import logging

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.gemini_api_key)

DEFAULT_MODEL = "gemini-2.0-flash"
PRO_MODEL = "gemini-1.5-pro"


from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

async def get_personalized_system_instruction(user_id: str, db: AsyncSession, base_instruction: str = "") -> str:
    """Fetch user's AI profile and merge into a comprehensive system instruction."""
    try:
        res = await db.execute(
            text("SELECT style_preference, custom_instructions FROM user_ai_profiles WHERE user_id = :uid"),
            {"uid": user_id}
        )
        profile = res.fetchone()
        if not profile:
            return base_instruction or "You are a professional assistant for Nexus ERP."
        
        style = profile.style_preference
        custom = profile.custom_instructions
        
        personalization = f"\n\nUSER PERSONALIZATION:\n- Tone/Style: {style}\n- Custom Guidelines: {custom}"
        return (base_instruction or "You are a professional assistant for Nexus ERP.") + personalization
    except Exception:
        return base_instruction or "You are a professional assistant for Nexus ERP."

async def log_ai_usage(
    db: AsyncSession, 
    tenant_id: str, 
    user_id: str, 
    model: str, 
    feature: str, 
    prompt_tokens: int, 
    completion_tokens: int
):
    """Log AI token usage to the global platform table."""
    try:
        await db.execute(
            text("""
                INSERT INTO platform.ai_usage_logs 
                (tenant_id, user_id, model_name, feature_name, prompt_tokens, completion_tokens, total_tokens)
                VALUES (:tid, :uid, :model, :feat, :pt, :ct, :tt)
            """),
            {
                "tid": tenant_id, "uid": user_id, "model": model, "feat": feature,
                "pt": prompt_tokens, "ct": completion_tokens, "tt": prompt_tokens + completion_tokens
            }
        )
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to log AI usage: {e}")

async def generate_text(
    prompt: str, 
    system_instruction: str | None = None, 
    use_pro: bool = False, 
    model: str | None = None,
    # New params for logging
    context: dict | None = None # Contains db, tenant_id, user_id, feature_name
) -> str:
    model_name = model or (PRO_MODEL if use_pro else DEFAULT_MODEL)
    
    # Configure with tenant key if provided in context
    if context and context.get("ai_api_key"):
        genai.configure(api_key=context["ai_api_key"])
    else:
        genai.configure(api_key=settings.gemini_api_key)

    ai_model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_instruction,
    )

    # Run the blocking SDK call in a thread to avoid blocking the async event loop
    response = await asyncio.to_thread(ai_model.generate_content, prompt)

    # Extract usage metadata for metering
    if context and "db" in context:
        usage = getattr(response, "usage_metadata", None)
        if usage:
            await log_ai_usage(
                context["db"],
                context["tenant_id"],
                context["user_id"],
                model_name,
                context.get("feature_name", "unknown"),
                usage.prompt_token_count,
                usage.candidates_token_count
            )

    return response.text


async def stream_text(
    prompt: str,
    history: list[dict] | None = None,
    system_instruction: str | None = None,
    model: str | None = None,
    context: dict | None = None,
) -> AsyncIterator[str]:
    # Configure with tenant key if provided
    if context and context.get("ai_api_key"):
        genai.configure(api_key=context["ai_api_key"])
    else:
        genai.configure(api_key=settings.gemini_api_key)

    ai_model = genai.GenerativeModel(
        model_name=model or DEFAULT_MODEL,
        system_instruction=system_instruction or "You are a helpful ERP assistant for Nexus.",
    )
    chat = ai_model.start_chat(
        history=[{"role": m["role"], "parts": [m["content"]]} for m in (history or [])]
    )
    response = chat.send_message(prompt, stream=True)
    for chunk in response:
        if chunk.text:
            yield chunk.text


async def transcribe_audio(
    audio_path: str,
    language_hint: str = "zh",
    context: dict | None = None,
) -> str:
    """Use Gemini multimodal API to transcribe an audio file."""
    if context and context.get("ai_api_key"):
        genai.configure(api_key=context["ai_api_key"])
    else:
        genai.configure(api_key=settings.gemini_api_key)

    # Upload audio to Gemini Files API
    uploaded = await asyncio.to_thread(genai.upload_file, audio_path)

    # Wait for file processing to complete
    while uploaded.state.name == "PROCESSING":
        await asyncio.sleep(1)
        uploaded = await asyncio.to_thread(genai.get_file, uploaded.name)

    model = genai.GenerativeModel(DEFAULT_MODEL)
    prompt = f"请将这段音频完整转录为文字。语言提示：{language_hint}。只输出转录文本，不要添加任何其他内容。"
    response = await asyncio.to_thread(
        model.generate_content, [uploaded, prompt]
    )

    # Clean up uploaded file
    try:
        await asyncio.to_thread(genai.delete_file, uploaded.name)
    except Exception:
        pass

    return response.text


async def generate_json(
    prompt: str, 
    system_instruction: str | None = None, 
    use_pro: bool = False, 
    model: str | None = None,
    context: dict | None = None
) -> dict:
    model_name = model or (PRO_MODEL if use_pro else DEFAULT_MODEL)
    
    # Configure with tenant key if provided in context
    if context and context.get("ai_api_key"):
        genai.configure(api_key=context["ai_api_key"])
    else:
        genai.configure(api_key=settings.gemini_api_key)

    ai_model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_instruction or "Return valid JSON only.",
        generation_config=genai.GenerationConfig(response_mime_type="application/json"),
    )

    response = await asyncio.to_thread(ai_model.generate_content, prompt)
    
    # Extract usage metadata for metering
    if context and "db" in context:
        usage = getattr(response, "usage_metadata", None)
        if usage:
            await log_ai_usage(
                context["db"],
                context["tenant_id"],
                context["user_id"],
                model_name,
                context.get("feature_name", "unknown"),
                usage.prompt_token_count,
                usage.candidates_token_count
            )

    try:
        parsed = json.loads(response.text)
        if not parsed:
            raise ValueError("Gemini returned empty JSON")
        return parsed
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Failed to parse JSON from Gemini: {response.text[:200]}")
        raise RuntimeError(f"AI 返回了无效的 JSON 格式: {e}")
