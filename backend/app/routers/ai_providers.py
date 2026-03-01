"""CRUD + test endpoints for per-tenant AI provider configuration."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user_with_tenant
from app.services.ai.provider import (
    AI_PROVIDER_CATALOG,
    get_provider_catalog,
    normalize_model,
    normalize_provider,
)
from app.utils.crypto import decrypt_api_key, encrypt_api_key, mask_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/ai-providers", tags=["ai-providers"])


# ── Pydantic models ─────────────────────────────────────────────────────────

class AIProviderCreate(BaseModel):
    provider: str
    api_key: str
    base_url: Optional[str] = None
    default_model: Optional[str] = None
    is_default: bool = False


class AIProviderUpdate(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    default_model: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


# ── Permission helper ────────────────────────────────────────────────────────

async def _require_tenant_admin(ctx: dict):
    """Raise 403 unless caller is tenant_admin, manager, or is_admin."""
    role = ctx.get("role", "")
    if role in ("tenant_admin", "platform_admin"):
        return
    row = await ctx["db"].execute(
        text("SELECT is_admin FROM users WHERE id = :id"),
        {"id": ctx["sub"]},
    )
    u = row.fetchone()
    if not u or not u.is_admin:
        raise HTTPException(status_code=403, detail="Admin rights required")


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/catalog")
async def get_catalog(ctx: dict = Depends(get_current_user_with_tenant)):
    """Return full available provider catalog with models."""
    await _require_tenant_admin(ctx)
    return get_provider_catalog()


@router.get("")
async def list_configs(ctx: dict = Depends(get_current_user_with_tenant)):
    """List the tenant's configured AI providers (keys masked)."""
    await _require_tenant_admin(ctx)
    db = ctx["db"]
    tid = ctx["tenant_id"]

    result = await db.execute(
        text("""
            SELECT id, provider, api_key_encrypted, base_url, default_model,
                   is_default, is_active, created_at, updated_at
            FROM platform.tenant_ai_configs
            WHERE tenant_id = :tid
            ORDER BY is_default DESC, created_at
        """),
        {"tid": tid},
    )
    rows = result.fetchall()

    configs = []
    for r in rows:
        masked = ""
        if r.api_key_encrypted:
            try:
                plain = decrypt_api_key(r.api_key_encrypted)
                masked = mask_api_key(plain)
            except Exception:
                masked = "****"
        catalog_entry = AI_PROVIDER_CATALOG.get(r.provider, {})
        configs.append({
            "id": str(r.id),
            "provider": r.provider,
            "label": catalog_entry.get("label", r.provider),
            "region": catalog_entry.get("region", ""),
            "api_key_masked": masked,
            "base_url": r.base_url,
            "default_model": r.default_model,
            "is_default": r.is_default,
            "is_active": r.is_active,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        })
    return configs


@router.post("")
async def create_config(body: AIProviderCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    """Add a new AI provider config for the tenant."""
    await _require_tenant_admin(ctx)
    db = ctx["db"]
    tid = ctx["tenant_id"]

    provider = normalize_provider(body.provider)
    if provider not in AI_PROVIDER_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {body.provider}")

    model = normalize_model(provider, body.default_model)
    encrypted = encrypt_api_key(body.api_key) if body.api_key else ""

    # Auto-set as default if this is the first config for the tenant
    existing_count = await db.execute(
        text("SELECT COUNT(*) FROM platform.tenant_ai_configs WHERE tenant_id = :tid"),
        {"tid": tid},
    )
    if existing_count.scalar() == 0:
        body.is_default = True

    # If setting as default, clear other defaults first
    if body.is_default:
        await db.execute(
            text("UPDATE platform.tenant_ai_configs SET is_default = FALSE WHERE tenant_id = :tid"),
            {"tid": tid},
        )

    try:
        result = await db.execute(
            text("""
                INSERT INTO platform.tenant_ai_configs
                    (tenant_id, provider, api_key_encrypted, base_url, default_model, is_default)
                VALUES (:tid, :provider, :key, :base_url, :model, :is_default)
                RETURNING id
            """),
            {
                "tid": tid,
                "provider": provider,
                "key": encrypted,
                "base_url": body.base_url or AI_PROVIDER_CATALOG[provider].get("base_url", ""),
                "model": model,
                "is_default": body.is_default,
            },
        )
        row = result.fetchone()
        await db.commit()
        return {"id": str(row.id), "status": "created"}
    except Exception as e:
        await db.rollback()
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Provider '{provider}' already configured for this tenant")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{config_id}")
async def update_config(config_id: str, body: AIProviderUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    """Update an existing AI provider config. Empty api_key = keep current key."""
    await _require_tenant_admin(ctx)
    db = ctx["db"]
    tid = ctx["tenant_id"]

    # Verify config belongs to tenant
    existing = await db.execute(
        text("SELECT id, provider FROM platform.tenant_ai_configs WHERE id = :id AND tenant_id = :tid"),
        {"id": config_id, "tid": tid},
    )
    row = existing.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Config not found")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no changes"}

    # If setting as default, clear others first
    if updates.get("is_default"):
        await db.execute(
            text("UPDATE platform.tenant_ai_configs SET is_default = FALSE WHERE tenant_id = :tid"),
            {"tid": tid},
        )

    set_parts = ["updated_at = NOW()"]
    params: dict = {"id": config_id, "tid": tid}

    if "api_key" in updates and updates["api_key"]:
        set_parts.append("api_key_encrypted = :key")
        params["key"] = encrypt_api_key(updates["api_key"])
    if "base_url" in updates:
        set_parts.append("base_url = :base_url")
        params["base_url"] = updates["base_url"]
    if "default_model" in updates:
        provider = normalize_provider(row.provider)
        model = normalize_model(provider, updates["default_model"])
        set_parts.append("default_model = :model")
        params["model"] = model
    if "is_default" in updates:
        set_parts.append("is_default = :is_default")
        params["is_default"] = updates["is_default"]
    if "is_active" in updates:
        set_parts.append("is_active = :is_active")
        params["is_active"] = updates["is_active"]

    await db.execute(
        text(f"UPDATE platform.tenant_ai_configs SET {', '.join(set_parts)} WHERE id = :id AND tenant_id = :tid"),
        params,
    )
    await db.commit()
    return {"status": "updated"}


@router.delete("/{config_id}")
async def delete_config(config_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Delete an AI provider config."""
    await _require_tenant_admin(ctx)
    db = ctx["db"]
    tid = ctx["tenant_id"]

    result = await db.execute(
        text("DELETE FROM platform.tenant_ai_configs WHERE id = :id AND tenant_id = :tid RETURNING id"),
        {"id": config_id, "tid": tid},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Config not found")
    await db.commit()
    return {"status": "deleted"}


@router.post("/{config_id}/test")
async def test_config(config_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Test an AI provider connection by sending a simple prompt."""
    await _require_tenant_admin(ctx)
    db = ctx["db"]
    tid = ctx["tenant_id"]

    row_result = await db.execute(
        text("""
            SELECT provider, api_key_encrypted, base_url, default_model
            FROM platform.tenant_ai_configs
            WHERE id = :id AND tenant_id = :tid
        """),
        {"id": config_id, "tid": tid},
    )
    row = row_result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Config not found")

    provider = normalize_provider(row.provider)
    model = normalize_model(provider, row.default_model)
    catalog_entry = AI_PROVIDER_CATALOG.get(provider, {})
    base_url = row.base_url or catalog_entry.get("base_url", "")

    try:
        api_key = decrypt_api_key(row.api_key_encrypted)
    except Exception:
        return {"success": False, "error": "Failed to decrypt API key"}

    if not api_key:
        return {"success": False, "error": "API key is empty"}

    try:
        from app.services.ai.provider import (
            _anthropic_completion,
            _openai_compatible_completion,
        )

        test_prompt = "Say 'hello' in one word."
        if provider == "gemini":
            from app.services.ai.gemini import generate_text as _gemini_gen
            result = await _gemini_gen(test_prompt, model=model, context={"ai_api_key": api_key})
        elif provider == "anthropic":
            result = await _anthropic_completion(
                api_key, base_url or "https://api.anthropic.com/v1", model,
                [{"role": "user", "content": test_prompt}],
            )
        else:
            result = await _openai_compatible_completion(
                api_key, base_url, model,
                [{"role": "user", "content": test_prompt}],
            )
        return {"success": True, "response": result[:200]}
    except Exception as e:
        logger.warning("AI provider test failed for %s: %s", provider, e)
        return {"success": False, "error": str(e)[:300]}
