import json
import logging
from typing import Any, AsyncIterator
from uuid import UUID

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.ai.gemini import generate_json as gemini_generate_json
from app.services.ai.gemini import generate_text as gemini_generate_text
from app.services.ai.gemini import stream_text as gemini_stream_text

logger = logging.getLogger(__name__)

DEFAULT_AI_PROVIDER = "gemini"
DEFAULT_AI_MODEL = "gemini-2.0-flash"

# ── Provider Catalog (7 providers) ──────────────────────────────────────────

AI_PROVIDER_CATALOG = {
    "gemini": {
        "label": "Gemini",
        "region": "US",
        "models": ["gemini-2.0-flash", "gemini-1.5-pro"],
        "base_url": "",
        "key_placeholder": "AIza...",
        "docs_url": "https://ai.google.dev/docs",
    },
    "openai": {
        "label": "OpenAI",
        "region": "US",
        "models": ["gpt-4.1-mini", "gpt-4.1", "gpt-4o"],
        "base_url": "https://api.openai.com/v1",
        "key_placeholder": "sk-...",
        "docs_url": "https://platform.openai.com/docs",
    },
    "anthropic": {
        "label": "Anthropic",
        "region": "US",
        "models": ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
        "base_url": "https://api.anthropic.com/v1",
        "key_placeholder": "sk-ant-...",
        "docs_url": "https://docs.anthropic.com",
    },
    "doubao": {
        "label": "Doubao",
        "region": "CN",
        "models": ["doubao-1.5-pro-32k", "doubao-1.5-lite-32k"],
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "key_placeholder": "your-doubao-key",
        "docs_url": "https://www.volcengine.com/docs/82379",
    },
    "moonshot": {
        "label": "Kimi / Moonshot",
        "region": "CN",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k"],
        "base_url": "https://api.moonshot.cn/v1",
        "key_placeholder": "sk-...",
        "docs_url": "https://platform.moonshot.cn/docs",
    },
    "deepseek": {
        "label": "DeepSeek",
        "region": "CN",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "base_url": "https://api.deepseek.com/v1",
        "key_placeholder": "sk-...",
        "docs_url": "https://platform.deepseek.com/docs",
    },
    "zhipu": {
        "label": "GLM",
        "region": "CN",
        "models": ["glm-4-flash", "glm-4"],
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "key_placeholder": "your-zhipu-key",
        "docs_url": "https://open.bigmodel.cn/dev/howuse/introduction",
    },
}

# Legacy alias: old "chatgpt" entries map to "openai"
_LEGACY_PROVIDER_MAP = {"chatgpt": "openai"}


def get_provider_catalog() -> dict:
    return AI_PROVIDER_CATALOG


def normalize_provider(provider: str | None) -> str:
    if not provider:
        return DEFAULT_AI_PROVIDER
    p = provider.strip().lower()
    p = _LEGACY_PROVIDER_MAP.get(p, p)
    return p if p in AI_PROVIDER_CATALOG else DEFAULT_AI_PROVIDER


def normalize_model(provider: str, model: str | None) -> str:
    models = AI_PROVIDER_CATALOG.get(provider, {}).get("models", [])
    if model and model in models:
        return model
    return models[0] if models else DEFAULT_AI_MODEL


# ── Tenant AI Config (new table) ───────────────────────────────────────────

async def get_tenant_ai_config(db: AsyncSession, tenant_id: UUID | str) -> dict:
    """Read the default+active config from platform.tenant_ai_configs.

    Returns ``{"provider", "model", "api_key", "base_url"}`` or falls back to
    global env variables / defaults.
    """
    from app.utils.crypto import decrypt_api_key

    row = await db.execute(
        text("""
            SELECT provider, api_key_encrypted, base_url, default_model
            FROM platform.tenant_ai_configs
            WHERE tenant_id = :tid AND is_active = TRUE AND is_default = TRUE
            LIMIT 1
        """),
        {"tid": str(tenant_id)},
    )
    cfg = row.fetchone()

    if cfg and cfg.api_key_encrypted:
        provider = normalize_provider(cfg.provider)
        model = normalize_model(provider, cfg.default_model)
        try:
            api_key = decrypt_api_key(cfg.api_key_encrypted)
        except Exception:
            logger.warning("Failed to decrypt tenant AI key, falling back to env")
            api_key = ""
        if api_key:
            catalog_entry = AI_PROVIDER_CATALOG.get(provider, {})
            base_url = cfg.base_url or catalog_entry.get("base_url", "")
            return {"provider": provider, "model": model, "api_key": api_key, "base_url": base_url}

    # Fallback: global env variables
    return _env_fallback_config()


_PLACEHOLDER_KEYS = {
    "", "your-gemini-api-key", "your-openai-api-key", "your-api-key",
    "your-doubao-key", "sk-...", "AIza...",
}


def _is_real_key(key: str | None) -> bool:
    """Return True only if key is a non-empty, non-placeholder string."""
    return bool(key) and key.strip() not in _PLACEHOLDER_KEYS


def _env_fallback_config() -> dict:
    """Build config from environment variables. Skips placeholder/empty keys."""
    if _is_real_key(settings.gemini_api_key):
        return {"provider": "gemini", "model": DEFAULT_AI_MODEL, "api_key": settings.gemini_api_key, "base_url": ""}
    if _is_real_key(settings.openai_api_key):
        return {"provider": "openai", "model": "gpt-4.1-mini", "api_key": settings.openai_api_key, "base_url": settings.openai_base_url}
    if _is_real_key(settings.doubao_api_key):
        return {"provider": "doubao", "model": "doubao-1.5-pro-32k", "api_key": settings.doubao_api_key, "base_url": settings.doubao_base_url}
    # No valid key configured – return empty (will raise clear error at call time)
    return {"provider": "gemini", "model": DEFAULT_AI_MODEL, "api_key": "", "base_url": ""}


# Legacy helper kept for backward-compat in callers not yet migrated
async def get_tenant_ai_settings(db: AsyncSession, tenant_slug: str | None) -> tuple[str, str]:
    if not tenant_slug:
        return DEFAULT_AI_PROVIDER, DEFAULT_AI_MODEL

    row = await db.execute(
        text("SELECT ai_provider, ai_model FROM platform.tenants WHERE slug = :slug"),
        {"slug": tenant_slug},
    )
    tenant = row.fetchone()
    if not tenant:
        return DEFAULT_AI_PROVIDER, DEFAULT_AI_MODEL

    provider = normalize_provider(getattr(tenant, "ai_provider", None))
    model = normalize_model(provider, getattr(tenant, "ai_model", None))
    return provider, model


# ── HTTP completion helpers ─────────────────────────────────────────────────

async def _openai_compatible_completion(
    api_key: str,
    base_url: str,
    model: str,
    messages: list[dict],
) -> str:
    if not api_key:
        raise RuntimeError("API key not configured")

    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "")


async def _anthropic_completion(
    api_key: str,
    base_url: str,
    model: str,
    messages: list[dict],
) -> str:
    """Call the Anthropic Messages API (x-api-key header, anthropic-version header)."""
    if not api_key:
        raise RuntimeError("Anthropic API key not configured")

    url = f"{base_url.rstrip('/')}/messages"
    # Convert OpenAI-style messages to Anthropic format
    system_text = ""
    anthropic_msgs = []
    for m in messages:
        if m["role"] == "system":
            system_text = m.get("content", "")
        else:
            anthropic_msgs.append({"role": m["role"], "content": m.get("content", "")})

    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": 4096,
        "messages": anthropic_msgs,
    }
    if system_text:
        payload["system"] = system_text

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    # Anthropic response: {"content": [{"type": "text", "text": "..."}]}
    blocks = data.get("content", [])
    return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")


def _safe_json_parse(raw: str) -> dict:
    txt = (raw or "").strip()
    if not txt:
        return {}

    # Strip simple markdown code fences if present.
    if txt.startswith("```"):
        txt = txt.strip("`")
        if txt.startswith("json"):
            txt = txt[4:]
        txt = txt.strip()

    try:
        value = json.loads(txt)
        return value if isinstance(value, dict) else {"result": value}
    except Exception:
        logger.error("Failed to parse provider JSON response: %s", txt[:200])
        return {}


# ── Unified dispatch helpers ────────────────────────────────────────────────

def _build_messages(prompt: str, system_instruction: str | None, history: list[dict] | None = None) -> list[dict]:
    msgs: list[dict] = []
    if system_instruction:
        msgs.append({"role": "system", "content": system_instruction})
    for m in history or []:
        role = "assistant" if m.get("role") == "model" else m.get("role", "user")
        msgs.append({"role": role, "content": m.get("content", "")})
    msgs.append({"role": "user", "content": prompt})
    return msgs


def _gemini_context(cfg: dict) -> dict:
    """Build a context dict for gemini calls with the tenant's API key."""
    return {"ai_api_key": cfg.get("api_key", "")}


async def _dispatch_text(cfg: dict, prompt: str, system_instruction: str | None, history: list[dict] | None = None) -> str:
    provider = cfg["provider"]
    model = cfg["model"]
    api_key = cfg["api_key"]
    base_url = cfg["base_url"]

    if not api_key:
        raise RuntimeError(
            "AI provider not configured. Please set a valid API key in Admin → AI Providers, "
            "or add GEMINI_API_KEY / OPENAI_API_KEY to the backend .env file."
        )

    if provider == "gemini":
        return await gemini_generate_text(prompt, system_instruction=system_instruction, model=model, context=_gemini_context(cfg))

    msgs = _build_messages(prompt, system_instruction or "You are a helpful assistant.", history)

    if provider == "anthropic":
        return await _anthropic_completion(api_key, base_url or "https://api.anthropic.com/v1", model, msgs)

    # openai / doubao / moonshot / deepseek / zhipu — all OpenAI-compatible
    catalog_entry = AI_PROVIDER_CATALOG.get(provider, {})
    url = base_url or catalog_entry.get("base_url", "https://api.openai.com/v1")
    return await _openai_compatible_completion(api_key, url, model, msgs)


async def _dispatch_json(cfg: dict, prompt: str, system_instruction: str | None) -> dict:
    provider = cfg["provider"]
    model = cfg["model"]

    if not cfg.get("api_key"):
        raise RuntimeError(
            "AI provider not configured. Please set a valid API key in Admin → AI Providers, "
            "or add GEMINI_API_KEY / OPENAI_API_KEY to the backend .env file."
        )

    if provider == "gemini":
        return await gemini_generate_json(prompt, system_instruction=system_instruction, model=model, context=_gemini_context(cfg))

    content = await _dispatch_text(cfg, prompt, system_instruction or "Return valid JSON only.")
    return _safe_json_parse(content)


# ── Public API (tenant_id-based) ────────────────────────────────────────────

async def generate_text_for_tenant(
    db: AsyncSession,
    tenant_id_or_slug: str | UUID | None,
    prompt: str,
    system_instruction: str | None = None,
) -> str:
    cfg = await _resolve_config(db, tenant_id_or_slug)
    return await _dispatch_text(cfg, prompt, system_instruction)


async def generate_json_for_tenant(
    db: AsyncSession,
    tenant_id_or_slug: str | UUID | None,
    prompt: str,
    system_instruction: str | None = None,
) -> dict:
    cfg = await _resolve_config(db, tenant_id_or_slug)
    return await _dispatch_json(cfg, prompt, system_instruction)


async def stream_text_for_tenant(
    db: AsyncSession,
    tenant_id_or_slug: str | UUID | None,
    prompt: str,
    history: list[dict] | None = None,
    system_instruction: str | None = None,
) -> AsyncIterator[str]:
    cfg = await _resolve_config(db, tenant_id_or_slug)
    provider = cfg["provider"]
    model = cfg["model"]

    if not cfg.get("api_key"):
        raise RuntimeError(
            "AI provider not configured. Please set a valid API key in Admin → AI Providers, "
            "or add GEMINI_API_KEY / OPENAI_API_KEY to the backend .env file."
        )

    if provider == "gemini":
        async for chunk in gemini_stream_text(prompt, history=history, system_instruction=system_instruction, model=model, context=_gemini_context(cfg)):
            yield chunk
        return

    # For non-gemini providers, fall back to single-shot then yield
    result = await _dispatch_text(cfg, prompt, system_instruction, history)
    yield result


async def transcribe_audio_for_tenant(
    db: AsyncSession,
    tenant_id_or_slug: str | UUID | None,
    audio_path: str,
    language_hint: str = "zh",
) -> str:
    cfg = await _resolve_config(db, tenant_id_or_slug)
    provider = cfg["provider"]

    if provider != "gemini":
        raise RuntimeError("Audio transcription currently requires Gemini provider")

    from app.services.ai.gemini import transcribe_audio
    return await transcribe_audio(audio_path, language_hint, context=_gemini_context(cfg))


async def _resolve_config(db: AsyncSession, tenant_id_or_slug: str | UUID | None) -> dict:
    """Resolve AI config: try tenant_ai_configs by UUID first, then by slug, then env fallback."""
    if not tenant_id_or_slug:
        return _env_fallback_config()

    tid = str(tenant_id_or_slug)

    # Try as UUID (tenant_id) first → new tenant_ai_configs table
    try:
        from uuid import UUID as _UUID
        _UUID(tid)  # validate it's a UUID
        return await get_tenant_ai_config(db, tid)
    except (ValueError, AttributeError):
        pass

    # Fall back to legacy slug-based lookup
    provider, model = await get_tenant_ai_settings(db, tid)
    cfg = _env_fallback_config()
    cfg["provider"] = provider
    cfg["model"] = model
    return cfg
