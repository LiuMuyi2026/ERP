"""
CRM Workflow — lead profile, interactions, workflow get/patch.
"""

import json

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant
from app.services.ai.company_research import research_company
from app.services.workflow_actions import trigger_workflow_actions
from app.services.workflow_templates import get_effective_template
from app.services.pipeline_config import compute_status_from_config, validate_workflow_data, get_pipeline_config
from app.core.events import events

from app.routers.crm_shared import (
    _LEAD_PROFILE_FIELDS,
    InteractionCreate, LeadProfileUpdate,
    _normalize_template_definition,
    _get_stage,
    logger,
)

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Interactions & Profile
# ---------------------------------------------------------------------------

@router.post("/leads/{lead_id}/interactions")
async def add_lead_interaction(
    lead_id: str, body: InteractionCreate, ctx: dict = Depends(get_current_user_with_tenant)
):
    db = ctx["db"]
    import uuid
    interaction_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO interactions (id, lead_id, type, direction, content, metadata, created_by)
            VALUES (:id, :lead_id, :type, :direction, :content, CAST(:metadata AS jsonb), :created_by)
        """),
        {
            "id": interaction_id,
            "lead_id": lead_id,
            "type": body.type,
            "direction": body.direction,
            "content": body.content,
            "metadata": json.dumps(body.metadata or {}),
            "created_by": ctx["sub"],
        },
    )
    await db.execute(
        text("UPDATE leads SET last_contacted_at = NOW() WHERE id = :id"),
        {"id": lead_id},
    )
    await db.commit()
    return {"id": interaction_id}


@router.patch("/leads/{lead_id}/profile")
async def update_lead_profile(
    lead_id: str, body: LeadProfileUpdate, ctx: dict = Depends(get_current_user_with_tenant)
):
    db = ctx["db"]
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return {"status": "no changes"}

    set_parts = []
    params: dict = {"id": lead_id}
    for k, v in updates.items():
        if k not in _LEAD_PROFILE_FIELDS:
            continue
        if k == "custom_fields":
            set_parts.append(f"custom_fields = custom_fields || CAST(:{k} AS jsonb)")
            params[k] = json.dumps(v)
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v
    set_parts.append("updated_at = NOW()")
    set_clause = ", ".join(set_parts)
    await db.execute(text(f"UPDATE leads SET {set_clause} WHERE id = :id"), params)
    await db.commit()
    return {"status": "updated"}


@router.post("/leads/{lead_id}/ai-research-company")
async def ai_research_company(
    lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)
):
    db = ctx["db"]
    lead_q = await db.execute(
        text("SELECT company, custom_fields FROM leads WHERE id = :id"),
        {"id": lead_id},
    )
    lead = lead_q.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    company_name = lead._mapping.get("company") or ""
    if not company_name.strip():
        raise HTTPException(status_code=400, detail="Company name is empty")
    website = (lead._mapping.get("custom_fields") or {}).get("website")
    result = await research_company(company_name, website)
    await db.execute(
        text("UPDATE leads SET ai_summary = :summary WHERE id = :id"),
        {"summary": result.get("summary", ""), "id": lead_id},
    )
    await db.commit()
    return result


# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------

def _find_newly_completed_steps(
    old_workflow: dict, new_workflow: dict, config,
) -> list[tuple[str, str, dict]]:
    """Return list of (stage_key, step_key, step_def) for newly completed steps."""
    newly_completed = []
    for stage_def in config.workflow_stages:
        sk = stage_def.get("key", "")
        old_stage = (old_workflow.get("stages") or {}).get(sk, {})
        new_stage = (new_workflow.get("stages") or {}).get(sk, {})
        old_done = set(old_stage.get("completed_steps", []))
        new_done = set(new_stage.get("completed_steps", []))
        for step in stage_def.get("steps", []):
            step_key = step.get("key")
            if step_key and step_key in new_done and step_key not in old_done:
                newly_completed.append((sk, step_key, step))
    return newly_completed


@router.get("/leads/{lead_id}/workflow")
async def get_lead_workflow(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    try:
        row = await db.execute(
            text("SELECT workflow_data, email, company, workflow_version FROM leads WHERE id = :id"),
            {"id": lead_id},
        )
        lead = row.fetchone()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")

        is_returning = False
        email = lead._mapping.get("email")
        company = lead._mapping.get("company")
        if email or company:
            conds, params = [], {"cur": lead_id}
            if email:
                conds.append("email = :email")
                params["email"] = email
            if company:
                conds.append("company ILIKE :company")
                params["company"] = company
            r = await db.execute(
                text(f"SELECT 1 FROM leads WHERE id != :cur AND status = 'won' AND ({' OR '.join(conds)}) LIMIT 1"),
                params,
            )
            is_returning = r.fetchone() is not None

        workflow_data = lead._mapping["workflow_data"] or {}
        template_slug = lead._mapping.get("workflow_template_slug")
        template = await get_effective_template(db, ctx.get("tenant_id"), template_slug)
        template_definition = _normalize_template_definition(template.get("definition")) if template else {}
        return {
            "workflow_data": workflow_data,
            "template": template_definition,
            "template_slug": template.get("slug") if template else template_slug,
            "template_name": template.get("name") if template else None,
            "is_returning_customer": is_returning,
            "workflow_version": lead._mapping.get("workflow_version", 0),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("get_lead_workflow failed for lead %s: %s", lead_id, exc)
        raise HTTPException(status_code=500, detail="获取工作流失败")


@router.patch("/leads/{lead_id}/workflow")
async def update_lead_workflow(
    lead_id: str,
    body: dict = Body(...),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    try:
        # Extract workflow_version from body before validation
        workflow_version_from_client = body.pop("workflow_version", None)

        cur = await db.execute(
            text("SELECT status, workflow_data, workflow_template_slug, workflow_version FROM leads WHERE id = :id"),
            {"id": lead_id},
        )
        cur_row = cur.fetchone()
        if not cur_row:
            raise HTTPException(status_code=404, detail="Lead not found")
        current_status = cur_row._mapping.get("status") or "new"
        old_workflow_data = cur_row._mapping.get("workflow_data") or {}
        template_slug = cur_row._mapping.get("workflow_template_slug")
        current_version = cur_row._mapping.get("workflow_version", 0)

        # Load pipeline config (config-driven status derivation)
        config = await get_pipeline_config(db, ctx.get("tenant_id"))

        # Validate workflow_data structure
        validation_errors = validate_workflow_data(body, config)
        if validation_errors:
            raise HTTPException(status_code=422, detail=f"Invalid workflow data: {'; '.join(validation_errors)}")

        # Config-driven status derivation (replaces hardcoded _compute_workflow_status)
        new_status = compute_status_from_config(body, config)
        _status_rank = config.status_rank
        cur_rank = _status_rank.index(current_status) if current_status in _status_rank else 0
        new_rank = _status_rank.index(new_status) if new_status in _status_rank else 0
        final_status = new_status if new_rank > cur_rank else current_status

        template_record = await get_effective_template(db, ctx.get("tenant_id"), template_slug)
        template_definition = _normalize_template_definition(template_record.get("definition")) if template_record else {}

        # Optimistic locking: only update if version matches
        expected_version = workflow_version_from_client if workflow_version_from_client is not None else current_version
        update_result = await db.execute(
            text("""UPDATE leads
                    SET workflow_data = CAST(:data AS jsonb), status = :status,
                        workflow_version = workflow_version + 1, updated_at = NOW()
                    WHERE id = :id AND workflow_version = :ver"""),
            {"data": json.dumps(body, ensure_ascii=False), "status": final_status, "id": lead_id, "ver": expected_version},
        )
        if update_result.rowcount == 0:
            raise HTTPException(status_code=409, detail="Workflow was modified by another user. Please refresh and try again.")

        # Detect newly completed steps and fire events + auto-actions
        newly_completed = _find_newly_completed_steps(old_workflow_data, body, config)
        for stage_key, step_key, step_def in newly_completed:
            step_data = ((body.get("stages") or {}).get(stage_key) or {}).get("steps_data", {}).get(step_key, {})
            await events.emit("crm.workflow.step_completed", {
                "lead_id": lead_id,
                "stage_key": stage_key,
                "step_key": step_key,
                "step_type": step_def.get("type"),
                "step_data": step_data,
                "tenant_id": ctx.get("tenant_id"),
                "user_id": ctx.get("sub"),
                "db": db,
            })

        # Audit trail: log uncompleted steps
        for stage_def in config.workflow_stages:
            sk = stage_def.get("key", "")
            old_stage = (old_workflow_data.get("stages") or {}).get(sk, {})
            new_stage = (body.get("stages") or {}).get(sk, {})
            old_done = set(old_stage.get("completed_steps", []))
            new_done = set(new_stage.get("completed_steps", []))
            for step in stage_def.get("steps", []):
                step_key = step.get("key")
                if step_key and step_key in old_done and step_key not in new_done:
                    await db.execute(
                        text("INSERT INTO crm_workflow_log (lead_id, stage_key, step_key, action, step_type, user_id) VALUES (CAST(:lid AS uuid), :sk, :stk, 'uncompleted', :st, CAST(:uid AS uuid))"),
                        {"lid": lead_id, "sk": sk, "stk": step_key, "st": step.get("type"), "uid": ctx.get("sub")},
                    )

        # Audit trail: log newly completed steps
        for stage_key, step_key, step_def in newly_completed:
            await db.execute(
                text("INSERT INTO crm_workflow_log (lead_id, stage_key, step_key, action, step_type, user_id) VALUES (CAST(:lid AS uuid), :sk, :stk, 'completed', :st, CAST(:uid AS uuid))"),
                {"lid": lead_id, "sk": stage_key, "stk": step_key, "st": step_def.get("type"), "uid": ctx.get("sub")},
            )

        # Auto-create contract when sign_contract is newly completed
        sign_contract_completed = any(sk == "sign_contract" for _, sk, _ in newly_completed)
        if sign_contract_completed:
            exists = await db.execute(
                text("SELECT 1 FROM crm_contracts WHERE lead_id = CAST(:lid AS uuid) LIMIT 1"),
                {"lid": lead_id},
            )
            if not exists.fetchone():
                s1 = _get_stage(body, 'contract_signing', '1')
                s0 = _get_stage(body, 'sales_negotiation', '0')
                s1_steps = s1.get('steps_data', {})
                s0_steps = s0.get('steps_data', {})
                sign_data = s1_steps.get('sign_contract', {})
                confirm_data = s0_steps.get('confirm_details', {})
                contract_no = (sign_data.get('contract_no') or confirm_data.get('contract_no') or f"WF-{lead_id[:8].upper()}")
                payment_method = confirm_data.get('payment_method', '')
                try:
                    amount = float(str(confirm_data.get('amount', '0')).replace(',', '').replace('$', '').replace('¥', '').strip() or 0)
                except ValueError:
                    amount = 0.0
                user_id = ctx.get('sub') or ''
                await db.execute(
                    text("""
                        INSERT INTO crm_contracts (contract_no, lead_id, contract_amount, payment_method, status, sign_date, created_by)
                        VALUES (:cn, CAST(:lid AS uuid), :amt, :pm, 'active', CURRENT_DATE, CAST(:uid AS uuid))
                        ON CONFLICT (contract_no) DO NOTHING
                    """),
                    {"cn": contract_no, "lid": lead_id, "amt": amount, "pm": payment_method, "uid": user_id},
                )

        await trigger_workflow_actions(db, lead_id, template_definition, old_workflow_data, body)
        await db.commit()
        return {"status": "ok", "lead_status": final_status}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("update_lead_workflow failed for lead %s: %s", lead_id, exc)
        await db.rollback()
        raise HTTPException(status_code=500, detail="保存失败")
