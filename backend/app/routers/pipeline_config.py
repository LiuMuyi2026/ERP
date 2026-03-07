"""
Pipeline Config API — exposes resolved pipeline configuration for frontend consumption.

GET  /api/pipeline-config  — returns the full resolved pipeline config for the current tenant.
PATCH /api/pipeline-config — updates the tenant's pipeline config (admin only).
"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.deps import get_current_user_with_tenant, require_admin_with_tenant
from app.services.pipeline_config import get_pipeline_config
from app.services.pipeline_defaults import DEFAULT_PIPELINE_DEFINITION
from sqlalchemy import text

router = APIRouter(tags=["pipeline-config"])


@router.get("/pipeline-config")
async def get_config(ctx: dict = Depends(get_current_user_with_tenant)):
    """Return the resolved pipeline configuration for the current tenant."""
    config = await get_pipeline_config(ctx["db"], ctx.get("tenant_id"))
    return config.to_dict()


class PipelineConfigUpdate(BaseModel):
    pipeline: Optional[dict] = None
    statuses: Optional[dict] = None
    operation_tasks: Optional[list] = None
    approval_rules: Optional[list] = None
    file_categories: Optional[list] = None
    role_mappings: Optional[dict] = None
    workflow_stages: Optional[list] = None
    general_statuses: Optional[list] = None


@router.patch("/pipeline-config")
async def update_config(body: PipelineConfigUpdate, ctx: dict = Depends(require_admin_with_tenant)):
    """Update the tenant's pipeline configuration. Creates the template if it doesn't exist."""
    db = ctx["db"]
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required")

    # Find existing tenant template
    result = await db.execute(
        text("""
            SELECT id, slug, definition
            FROM platform.workflow_templates
            WHERE scope = 'tenant' AND tenant_id = :tid AND is_active = TRUE
            ORDER BY version DESC LIMIT 1
        """),
        {"tid": tenant_id},
    )
    row = result.fetchone()

    # Merge updates into existing definition
    if row:
        existing_def = row.definition if isinstance(row.definition, dict) else json.loads(row.definition or "{}")
    else:
        existing_def = dict(DEFAULT_PIPELINE_DEFINITION)

    updates = body.model_dump(exclude_none=True)
    for key, val in updates.items():
        if key in ("pipeline", "statuses"):
            # Merge nested dicts
            if key not in existing_def:
                existing_def[key] = {}
            existing_def[key].update(val)
        elif key == "workflow_stages":
            # Save to both keys: workflow_stages (canonical) and stages (WorkflowTab reads this)
            existing_def["workflow_stages"] = val
            existing_def["stages"] = val
        else:
            existing_def[key] = val

    definition_json = json.dumps(existing_def, ensure_ascii=False)

    if row:
        await db.execute(
            text("UPDATE platform.workflow_templates SET definition = CAST(:def AS jsonb), updated_at = NOW() WHERE id = :id"),
            {"def": definition_json, "id": str(row.id)},
        )
    else:
        # Auto-create tenant template
        slug_result = await db.execute(
            text("SELECT slug FROM platform.tenants WHERE id = :tid"),
            {"tid": tenant_id},
        )
        tenant_slug = slug_result.scalar() or "unknown"
        await db.execute(
            text("""
                INSERT INTO platform.workflow_templates
                (id, name, slug, description, definition, version, scope, tenant_id, is_active, created_by, updated_by)
                VALUES (:id, :name, :slug, :desc, CAST(:def AS jsonb), 1, 'tenant', :tid, TRUE, :uid, :uid)
            """),
            {
                "id": str(uuid.uuid4()),
                "name": "默认流程",
                "slug": f"default-{tenant_slug}",
                "desc": "Auto-created pipeline configuration",
                "def": definition_json,
                "tid": tenant_id,
                "uid": ctx.get("sub"),
            },
        )

    await db.commit()

    # Return the updated config
    config = await get_pipeline_config(db, tenant_id)
    return config.to_dict()
