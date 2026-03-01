from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import require_admin_with_tenant
from app.services.workflow_templates import (
    create_template,
    deactivate_other_templates,
    get_active_template,
    get_template_by_slug,
    list_templates as list_template_records,
    update_template,
)

router = APIRouter(prefix="/workflow-templates", tags=["workflow-templates"])


class WorkflowTemplateBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    scope: Literal["tenant", "platform"] = Field("tenant", description="Tenant scope → available for that tenant only; platform scope is global")


class WorkflowTemplateCreate(WorkflowTemplateBase):
    definition: dict = Field(default_factory=dict)
    version: int = 1
    is_active: bool = False


class WorkflowTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    definition: Optional[dict] = None
    version: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_templates(ctx: dict = Depends(require_admin_with_tenant)):
    db = ctx["db"]
    tenant_id = ctx.get("tenant_id")
    records = await list_template_records(db, tenant_id)
    return records


@router.post("", status_code=201)
async def create_workflow_template(
    body: WorkflowTemplateCreate,
    ctx: dict = Depends(require_admin_with_tenant),
):
    db = ctx["db"]
    tenant_id = ctx.get("tenant_id")
    if body.scope == "tenant" and not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant scope requires tenant context")
    payload = body.model_dump()
    payload["tenant_id"] = tenant_id if body.scope == "tenant" else None
    payload["created_by"] = ctx.get("sub")
    payload["updated_by"] = ctx.get("sub")
    if body.is_active:
        await deactivate_other_templates(db, body.scope, payload["tenant_id"])
    record = await create_template(db, payload)
    return record


@router.get("/{slug}")
async def get_workflow_template(
    slug: str,
    ctx: dict = Depends(require_admin_with_tenant),
):
    db = ctx["db"]
    record = await get_template_by_slug(db, slug)
    if not record:
        raise HTTPException(status_code=404, detail="Template not found")
    return record


@router.get("/active")
async def get_active_workflow_template(ctx: dict = Depends(require_admin_with_tenant)):
    db = ctx["db"]
    tenant_id = ctx.get("tenant_id")
    record = await get_active_template(db, tenant_id)
    if not record:
        raise HTTPException(status_code=404, detail="Active template not found")
    return record


@router.patch("/{slug}")
async def update_workflow_template(
    slug: str,
    body: WorkflowTemplateUpdate,
    ctx: dict = Depends(require_admin_with_tenant),
):
    db = ctx["db"]
    record = await get_template_by_slug(db, slug)
    if not record:
        raise HTTPException(status_code=404, detail="Template not found")
    updates = body.model_dump(exclude_none=True)
    if "is_active" in updates and updates["is_active"]:
        await deactivate_other_templates(db, record["scope"], record.get("tenant_id"), exclude_slug=slug)
    updated = await update_template(db, slug, updates)
    return updated
