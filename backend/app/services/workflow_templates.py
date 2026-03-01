from typing import Optional

import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.sql import build_update_clause


def _normalize_definition(definition: Optional[dict]) -> dict:
    if isinstance(definition, str):
        try:
            return json.loads(definition)
        except json.JSONDecodeError:
            return {}
    if isinstance(definition, dict):
        return definition
    return {}


async def list_templates(db: AsyncSession, tenant_id: Optional[str] = None):
    params = {'tenant_id': tenant_id}
    result = await db.execute(text("""
        SELECT *
        FROM platform.workflow_templates
        WHERE scope = 'platform' OR (scope = 'tenant' AND tenant_id = :tenant_id)
        ORDER BY version DESC, created_at DESC
    """), params)
    templates = [dict(r._mapping) for r in result.fetchall()]
    for template in templates:
        template["definition"] = _normalize_definition(template.get("definition"))
    return templates


async def get_template_by_slug(db: AsyncSession, slug: str):
    result = await db.execute(
        text("SELECT * FROM platform.workflow_templates WHERE slug = :slug"),
        {"slug": slug},
    )
    row = result.fetchone()
    if not row:
        return None
    record = dict(row._mapping)
    record["definition"] = _normalize_definition(record.get("definition"))
    return record


async def get_active_template(db: AsyncSession, tenant_id: Optional[str] = None):
    params = {'tenant_id': tenant_id}
    result = await db.execute(
        text("""
            SELECT *
            FROM platform.workflow_templates
            WHERE is_active
              AND (
                  (scope = 'tenant' AND tenant_id = :tenant_id)
                  OR scope = 'platform'
              )
            ORDER BY CASE WHEN scope = 'tenant' THEN 0 ELSE 1 END, version DESC
            LIMIT 1
        """),
        params,
    )
    row = result.fetchone()
    if not row:
        return None
    record = dict(row._mapping)
    record["definition"] = _normalize_definition(record.get("definition"))
    return record


async def get_effective_template(db: AsyncSession, tenant_id: Optional[str] = None, slug: Optional[str] = None):
    if slug:
        record = await get_template_by_slug(db, slug)
        if record:
            return record
    return await get_active_template(db, tenant_id)


async def create_template(db: AsyncSession, payload: dict):
    stmt = text("""
        INSERT INTO platform.workflow_templates
        (name, slug, description, definition, version, scope, tenant_id, is_active, created_by, updated_by)
        VALUES (:name, :slug, :description, CAST(:definition AS jsonb), :version, :scope, :tenant_id, :is_active, :created_by, :updated_by)
        RETURNING *
    """)
    params = payload.copy()
    params["definition"] = json.dumps(payload.get("definition", {}), ensure_ascii=False)
    result = await db.execute(stmt, params)
    return dict(result.fetchone()._mapping)


async def update_template(db: AsyncSession, slug: str, updates: dict):
    if not updates:
        return None
    if "definition" in updates:
        updates["definition"] = json.dumps(updates["definition"], ensure_ascii=False)
    set_clause, params = build_update_clause(updates, set(updates.keys()), jsonb_fields={'definition'})
    if not set_clause:
        return None
    params["slug"] = slug
    await db.execute(
        text(f"UPDATE platform.workflow_templates SET {set_clause}, updated_at = NOW() WHERE slug = :slug"),
        params,
    )
    return await get_template_by_slug(db, slug)


async def deactivate_other_templates(
    db: AsyncSession,
    scope: str,
    tenant_id: Optional[str] = None,
    exclude_slug: Optional[str] = None,
):
    clauses = ["scope = :scope"]
    params: dict = {"scope": scope}
    if scope == "tenant":
        clauses.append("tenant_id = :tenant_id")
        params["tenant_id"] = tenant_id
    else:
        clauses.append("tenant_id IS NULL")
    if exclude_slug:
        clauses.append("slug != :slug")
        params["slug"] = exclude_slug
    await db.execute(
        text(f"UPDATE platform.workflow_templates SET is_active = FALSE WHERE {' AND '.join(clauses)}"),
        params,
    )
