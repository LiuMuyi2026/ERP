import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.deps import get_db, require_platform_admin
from app.services.tenant import provision_tenant_schema
from app.services.auth import get_password_hash, create_token_for_tenant_user
from app.utils.sql import safe_set_search_path, build_update_clause, validate_tenant_slug

router = APIRouter(prefix="/platform", tags=["platform"])


class CreateTenantRequest(BaseModel):
    name: str
    slug: str
    admin_email: str
    admin_password: str
    admin_name: str | None = None


class TenantAIConfig(BaseModel):
    ai_provider: str | None = "gemini"
    ai_model: str | None = "gemini-2.0-flash"
    ai_api_key: str | None = None


@router.get("/analytics/ai-usage")
async def get_ai_usage_analytics(
    tenant_id: str | None = None,
    db: AsyncSession = Depends(get_db), 
    _: dict = Depends(require_platform_admin)
):
    """Aggregate AI usage by tenant or global summary."""
    where_clause = ""
    params = {}
    if tenant_id:
        where_clause = "WHERE u.tenant_id = :tid"
        params["tid"] = tenant_id

    # Global summary by tenant
    summary_query = f"""
        SELECT t.name, t.slug, COUNT(u.id) as total_requests, SUM(u.total_tokens) as total_tokens
        FROM platform.ai_usage_logs u
        JOIN platform.tenants t ON u.tenant_id = t.id
        {where_clause}
        GROUP BY t.name, t.slug
        ORDER BY total_tokens DESC
    """
    
    # Detailed log
    details_query = f"""
        SELECT u.*, t.slug as tenant_slug 
        FROM platform.ai_usage_logs u
        JOIN platform.tenants t ON u.tenant_id = t.id
        {where_clause}
        ORDER BY u.created_at DESC
        LIMIT 100
    """
    
    summary_res = await db.execute(text(summary_query), params)
    details_res = await db.execute(text(details_query), params)
    
    return {
        "summary": [dict(row._mapping) for row in summary_res.fetchall()],
        "recent_logs": [dict(row._mapping) for row in details_res.fetchall()]
    }


@router.patch("/tenants/{tenant_id}/ai-config")
async def update_tenant_ai_config(
    tenant_id: str,
    body: TenantAIConfig,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_platform_admin)
):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no changes"}

    # Legacy: still update platform.tenants columns
    _AI_CONFIG_FIELDS = {"ai_provider", "ai_model", "ai_api_key"}
    set_clause, params = build_update_clause(updates, _AI_CONFIG_FIELDS)
    if set_clause:
        params["id"] = tenant_id
        await db.execute(
            text(f"UPDATE platform.tenants SET {set_clause} WHERE id = :id"),
            params,
        )

    # Also write to the new tenant_ai_configs table (encrypted)
    provider = updates.get("ai_provider", "gemini")
    api_key = updates.get("ai_api_key", "")
    model = updates.get("ai_model", "gemini-2.0-flash")

    if api_key:
        from app.utils.crypto import encrypt_api_key
        encrypted = encrypt_api_key(api_key)
        await db.execute(
            text("""
                INSERT INTO platform.tenant_ai_configs (tenant_id, provider, api_key_encrypted, default_model, is_default, is_active)
                VALUES (:tid, :provider, :key, :model, TRUE, TRUE)
                ON CONFLICT (tenant_id, provider) DO UPDATE SET
                    api_key_encrypted = EXCLUDED.api_key_encrypted,
                    default_model = EXCLUDED.default_model,
                    is_default = TRUE,
                    updated_at = NOW()
            """),
            {"tid": tenant_id, "provider": provider, "key": encrypted, "model": model},
        )

    await db.commit()
    return {"status": "updated"}


@router.get("/tenants")
async def list_tenants(db: AsyncSession = Depends(get_db), _: dict = Depends(require_platform_admin)):
    result = await db.execute(
        text("SELECT id, name, slug, is_active, schema_provisioned, crm_enabled, hr_enabled, accounting_enabled, inventory_enabled, created_at FROM platform.tenants ORDER BY created_at DESC")
    )
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/tenants")
async def create_tenant(body: CreateTenantRequest, db: AsyncSession = Depends(get_db), _: dict = Depends(require_platform_admin)):
    validate_tenant_slug(body.slug)
    result = await db.execute(text("SELECT id FROM platform.tenants WHERE slug = :slug"), {"slug": body.slug})
    if result.fetchone():
        raise HTTPException(status_code=409, detail="Slug already in use")

    tenant_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO platform.tenants (id, name, slug, schema_provisioned) VALUES (:id, :name, :slug, FALSE)"),
        {"id": tenant_id, "name": body.name, "slug": body.slug}
    )
    await provision_tenant_schema(body.slug, db)

    await safe_set_search_path(db, body.slug)
    user_id = str(uuid.uuid4())
    hashed = get_password_hash(body.admin_password)
    await db.execute(
        text("INSERT INTO users (id, email, hashed_password, full_name, role) VALUES (:id, :email, :pw, :name, 'tenant_admin')"),
        {"id": user_id, "email": body.admin_email, "pw": hashed, "name": body.admin_name}
    )
    await db.execute(text("SET search_path TO platform, public"))
    await db.execute(
        text("UPDATE platform.tenants SET schema_provisioned = TRUE WHERE id = :id"),
        {"id": tenant_id}
    )
    await db.commit()
    return {"id": tenant_id, "name": body.name, "slug": body.slug, "schema_provisioned": True}


@router.delete("/tenants/{tenant_id}")
async def disable_tenant(tenant_id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(require_platform_admin)):
    await db.execute(text("UPDATE platform.tenants SET is_active = FALSE WHERE id = :id"), {"id": tenant_id})
    await db.commit()
    return {"status": "disabled"}


@router.post("/tenants/{slug}/impersonate")
async def impersonate_tenant(slug: str, db: AsyncSession = Depends(get_db), _: dict = Depends(require_platform_admin)):
    await safe_set_search_path(db, slug)
    result = await db.execute(text("SELECT id, email FROM users WHERE role = 'tenant_admin' LIMIT 1"))
    admin = result.fetchone()
    if not admin:
        raise HTTPException(status_code=404, detail="No tenant admin found")
    result2 = await db.execute(text("SELECT id FROM platform.tenants WHERE slug = :slug"), {"slug": slug})
    tenant = result2.fetchone()
    token = create_token_for_tenant_user(str(admin.id), admin.email, "tenant_admin", str(tenant.id), slug, ["*"])
    return {"access_token": token, "tenant_slug": slug}


@router.get("/health")
async def system_health(db: AsyncSession = Depends(get_db), _: dict = Depends(require_platform_admin)):
    result = await db.execute(text("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'"))
    schemas = [row[0] for row in result.fetchall()]
    return {"tenant_schemas": schemas, "schema_count": len(schemas), "status": "healthy"}
