"""
CRM Todos & Supply Chain inquiries.
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Todos & Supply Chain
# ---------------------------------------------------------------------------

@router.get("/todos")
async def get_todos(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]
    todos = []

    rows = await db.execute(text("""
        SELECT id, full_name, company, status, follow_up_status, updated_at, last_contacted_at
        FROM leads
        WHERE assigned_to = :uid
          AND follow_up_status = 'pending'
          AND (is_cold IS NULL OR is_cold = FALSE)
          AND duplicate_of IS NULL
        ORDER BY updated_at ASC
        LIMIT 50
    """), {"uid": user_id})
    for r in rows.fetchall():
        row = dict(r._mapping)
        days_since = None
        ref_date = row.get("last_contacted_at") or row.get("updated_at")
        if ref_date:
            now = datetime.now(timezone.utc)
            ref = ref_date if hasattr(ref_date, 'timestamp') else datetime.fromisoformat(str(ref_date))
            if ref.tzinfo is None:
                ref = ref.replace(tzinfo=timezone.utc)
            days_since = (now - ref).days
        todos.append({
            "lead_id": str(row["id"]),
            "full_name": row["full_name"],
            "company": row.get("company"),
            "status": row["status"],
            "type": "pending_followup",
            "days_since": days_since,
        })

    rows2 = await db.execute(text("""
        SELECT l.id, l.full_name, l.company, l.status, l.last_contacted_at, l.updated_at
        FROM leads l
        WHERE l.assigned_to = :uid
          AND l.status IN ('inquiry', 'new', 'replied', 'engaged', 'qualified', 'contacted', 'quoted', 'negotiating')
          AND (is_cold IS NULL OR is_cold = FALSE)
          AND l.duplicate_of IS NULL
          AND l.follow_up_status != 'pending'
          AND (l.last_contacted_at IS NULL OR l.last_contacted_at < NOW() - INTERVAL '3 days')
        ORDER BY COALESCE(l.last_contacted_at, l.created_at) ASC
        LIMIT 30
    """), {"uid": user_id})
    existing_ids = {t["lead_id"] for t in todos}
    for r in rows2.fetchall():
        row = dict(r._mapping)
        if str(row["id"]) in existing_ids:
            continue
        days_since = None
        ref_date = row.get("last_contacted_at") or row.get("updated_at")
        if ref_date:
            now = datetime.now(timezone.utc)
            ref = ref_date if hasattr(ref_date, 'timestamp') else datetime.fromisoformat(str(ref_date))
            if ref.tzinfo is None:
                ref = ref.replace(tzinfo=timezone.utc)
            days_since = (now - ref).days
        todos.append({
            "lead_id": str(row["id"]),
            "full_name": row["full_name"],
            "company": row.get("company"),
            "status": row["status"],
            "type": "no_contact",
            "days_since": days_since,
        })

    return {"todos": todos, "count": len(todos)}


@router.get("/supply-chain/inquiries")
async def get_supply_chain_inquiries(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    rows = await db.execute(text("""
        SELECT l.id, l.full_name, l.company, l.status,
               l.workflow_data
        FROM leads l
        WHERE (l.workflow_data->'stages'->'0'->'steps_data'->'price_inquiry'->>'submitted')::boolean = true
          AND (l.is_cold IS NULL OR l.is_cold = FALSE)
        ORDER BY l.updated_at DESC
    """))
    result = []
    for r in rows.fetchall():
        m = r._mapping
        wf = m.get("workflow_data") or {}
        stage0 = wf.get("stages", {}).get("0", {})
        steps = stage0.get("steps_data", {})
        piq = steps.get("price_inquiry", {})
        inquiry_level = stage0.get("meta", {}).get("inquiry_level", "")
        result.append({
            "lead_id": str(m["id"]),
            "full_name": m["full_name"],
            "company": m.get("company"),
            "inquiry_level": inquiry_level,
            "product_name": piq.get("product_name", ""),
            "specs": piq.get("specs", ""),
            "target_price": piq.get("target_price", ""),
            "quantity": piq.get("quantity", ""),
            "delivery": piq.get("delivery", ""),
            "submitted_at": piq.get("submitted_at", ""),
            "quotes": piq.get("quotes", []),
            "sc_result": piq.get("sc_result"),
        })
    return result


@router.patch("/supply-chain/inquiries/{lead_id}")
async def update_supply_chain_inquiry(
    lead_id: str, body: dict, ctx: dict = Depends(get_current_user_with_tenant)
):
    db = ctx["db"]
    row = await db.execute(text("SELECT id FROM leads WHERE id = :id"), {"id": lead_id})
    if not row.fetchone():
        raise HTTPException(status_code=404, detail="Lead not found")

    if "quotes" in body:
        await db.execute(
            text("""
                UPDATE leads
                SET workflow_data = jsonb_set(
                    COALESCE(workflow_data, '{}'),
                    '{stages,0,steps_data,price_inquiry,quotes}',
                    CAST(:quotes AS jsonb),
                    true
                ), updated_at = NOW()
                WHERE id = :id
            """),
            {"quotes": json.dumps(body["quotes"]), "id": lead_id},
        )

    if "final_price" in body:
        sc_result = {
            "final_price": body["final_price"],
            "note": body.get("note", ""),
            "confirmed": True,
        }
        await db.execute(
            text("""
                UPDATE leads
                SET workflow_data = jsonb_set(
                    COALESCE(workflow_data, '{}'),
                    '{stages,0,steps_data,price_inquiry,sc_result}',
                    CAST(:sc_result AS jsonb),
                    true
                ), updated_at = NOW()
                WHERE id = :id
            """),
            {"sc_result": json.dumps(sc_result), "id": lead_id},
        )

    await db.commit()
    return {"status": "ok"}
