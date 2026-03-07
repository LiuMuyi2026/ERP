"""
CRM Leads — CRUD, duplicate check, cold/restore, advance-stage, convert.
"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant
from app.services.ai.deduplication import check_duplicate_lead
from app.services.pipeline_config import get_pipeline_config
from app.utils.sql import build_update_clause

from app.routers.crm_shared import (
    _LEAD_UPDATE_FIELDS,
    LeadCreate, LeadUpdate, NameDupCheck,
    _auto_link_communications_for_lead,
)

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Leads CRUD
# ---------------------------------------------------------------------------

@router.get("/leads")
async def list_leads(
    status: Optional[str] = None,
    search: Optional[str] = None,
    pool: Optional[str] = None,
    user_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    where = ["duplicate_of IS NULL", "status != 'contact'"]
    params: dict = {"skip": skip, "limit": limit}
    if pool == "public":
        where.append("is_cold = TRUE")
    else:
        where.append("(is_cold IS NULL OR is_cold = FALSE)")
        if status:
            where.append("status = :status")
            params["status"] = status
    if search:
        where.append("(full_name ILIKE :search OR email ILIKE :search OR company ILIKE :search)")
        params["search"] = f"%{search}%"
    if user_id:
        where.append("(assigned_to = :uid OR created_by = :uid)")
        params["uid"] = user_id
    query = f"SELECT * FROM leads WHERE {' AND '.join(where)} ORDER BY created_at DESC LIMIT :limit OFFSET :skip"
    rows = await db.execute(text(query), params)
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/leads/check-duplicate")
async def check_duplicate(
    body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    full_name = (body.get("full_name") or "").strip()
    email = (body.get("email") or "").strip()
    whatsapp = (body.get("whatsapp") or "").strip()

    matches = []
    if full_name:
        rows = await db.execute(
            text("SELECT id, full_name, email, whatsapp, status, is_cold FROM leads WHERE full_name ILIKE :name AND (is_cold IS NULL OR is_cold = FALSE) LIMIT 5"),
            {"name": full_name},
        )
        matches.extend([dict(r._mapping) for r in rows.fetchall()])
    if email:
        rows = await db.execute(
            text("SELECT id, full_name, email, whatsapp, status, is_cold FROM leads WHERE email ILIKE :email AND (is_cold IS NULL OR is_cold = FALSE) LIMIT 5"),
            {"email": email},
        )
        for r in rows.fetchall():
            d = dict(r._mapping)
            if not any(m["id"] == d["id"] for m in matches):
                matches.append(d)
    if whatsapp:
        rows = await db.execute(
            text("SELECT id, full_name, email, whatsapp, status, is_cold FROM leads WHERE whatsapp = :wa AND (is_cold IS NULL OR is_cold = FALSE) LIMIT 5"),
            {"wa": whatsapp},
        )
        for r in rows.fetchall():
            d = dict(r._mapping)
            if not any(m["id"] == d["id"] for m in matches):
                matches.append(d)

    active_statuses = {"new", "inquiry", "replied", "quoted", "engaged", "qualified", "negotiating", "fulfillment"}
    has_active = any(m.get("status") in active_statuses for m in matches)

    return {"matches": matches, "has_active": has_active}


@router.patch("/leads/{lead_id}/cold")
async def mark_cold_lead(lead_id: str, body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    reason = (body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="冷线索原因不能为空")
    await ctx["db"].execute(
        text("UPDATE leads SET is_cold = TRUE, cold_lead_reason = :reason, status = 'cold', updated_at = NOW() WHERE id = :id"),
        {"reason": reason, "id": lead_id},
    )
    await ctx["db"].commit()
    return {"status": "cold"}


@router.patch("/leads/{lead_id}/restore")
async def restore_cold_lead(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await db.execute(
        text("UPDATE leads SET is_cold = FALSE, cold_lead_reason = NULL, status = 'inquiry', updated_at = NOW() WHERE id = :id AND is_cold = TRUE"),
        {"id": lead_id},
    )
    await db.commit()
    return {"status": "restored"}


@router.patch("/leads/{lead_id}/advance-stage")
async def advance_lead_stage(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(text("SELECT status FROM leads WHERE id = :id"), {"id": lead_id})
    lead = row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    current = lead.status

    # Load transitions from pipeline config (with hardcoded fallback)
    config = await get_pipeline_config(db, ctx.get("tenant_id"))
    next_status = config.transitions.get(current)
    if not next_status:
        raise HTTPException(status_code=400, detail=f"无法从 {current} 继续推进")
    await db.execute(
        text("UPDATE leads SET status = :status, updated_at = NOW() WHERE id = :id"),
        {"status": next_status, "id": lead_id},
    )
    await db.commit()
    return {"previous_status": current, "new_status": next_status}


@router.post("/leads")
async def create_lead(body: LeadCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    dup_check = await check_duplicate_lead(body.full_name, body.email, body.phone, body.whatsapp, db, tenant_id=ctx.get("tenant_id"))
    lead_id = str(uuid.uuid4())
    cf = json.dumps(body.custom_fields or {})
    await db.execute(
        text(
            """
            INSERT INTO leads (id, full_name, email, phone, whatsapp, company, title, source, status,
                               follow_up_status, assigned_to, created_by, duplicate_of, custom_fields)
            VALUES (:id, :name, :email, :phone, :whatsapp, :company, :title, :source, :status,
                    :fu_status, :assigned_to, :creator, :dup_of, CAST(:cf AS JSONB))
            """
        ),
        {
            "id": lead_id,
            "name": body.full_name,
            "email": body.email,
            "phone": body.phone,
            "whatsapp": body.whatsapp,
            "company": body.company,
            "title": body.title,
            "source": body.source,
            "status": body.status,
            "fu_status": body.follow_up_status,
            "assigned_to": body.assigned_to or None,
            "creator": ctx["sub"],
            "dup_of": dup_check.get("duplicate_id") if dup_check.get("is_duplicate") else None,
            "cf": cf,
        },
    )
    await _auto_link_communications_for_lead(db, lead_id, body.email, body.whatsapp)
    await db.commit()
    return {"id": lead_id, **body.model_dump(), "duplicate_check": dup_check}


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause, params = build_update_clause(updates, _LEAD_UPDATE_FIELDS)
    if not set_clause:
        return {"status": "no changes"}
    params["id"] = lead_id
    await db.execute(text(f"UPDATE leads SET {set_clause}, updated_at = NOW() WHERE id = :id"), params)

    if "email" in updates or "whatsapp" in updates:
        row = await db.execute(text("SELECT email, whatsapp FROM leads WHERE id = :id"), {"id": lead_id})
        lead_row = row.fetchone()
        if lead_row:
            await _auto_link_communications_for_lead(
                db,
                lead_id,
                getattr(lead_row, "email", None),
                getattr(lead_row, "whatsapp", None),
            )

    await db.commit()
    return {"status": "updated"}


@router.post("/leads/{lead_id}/convert")
async def convert_lead(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(text("SELECT * FROM leads WHERE id = :id"), {"id": lead_id})
    lead = row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    contact_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO contacts (id, full_name, email, phone, whatsapp, title, created_by)
            VALUES (:id, :name, :email, :phone, :whatsapp, :title, :creator)
            """
        ),
        {
            "id": contact_id,
            "name": lead.full_name,
            "email": lead.email,
            "phone": lead.phone,
            "whatsapp": lead.whatsapp,
            "title": lead.title,
            "creator": ctx["sub"],
        },
    )
    await db.execute(text("UPDATE leads SET status = 'converted', updated_at = NOW() WHERE id = :id"), {"id": lead_id})
    await db.commit()
    return {"contact_id": contact_id, "status": "converted"}


@router.post("/leads/check-name-duplicate")
async def check_name_duplicate(
    body: NameDupCheck,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    current_user = ctx["sub"]
    name = body.full_name.strip()
    if not name:
        return {"matches": []}

    rows = await db.execute(
        text("""
            SELECT l.id, l.full_name, l.company, l.email, l.whatsapp, l.status,
                   l.assigned_to,
                   COALESCE(u.full_name, '') AS assigned_to_name
            FROM leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE l.full_name ILIKE :name
              AND (l.is_cold IS NULL OR l.is_cold = FALSE)
            LIMIT 10
        """),
        {"name": f"%{name}%"},
    )
    matches = []
    for r in rows.fetchall():
        d = dict(r._mapping)
        d["is_mine"] = str(d.get("assigned_to") or "") == str(current_user)
        matches.append(d)

    return {"matches": matches}
