"""
CRM Analytics — workflow template, overview, analytics, and AI analysis.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant
from app.services.workflow_templates import get_active_template

from app.routers.crm_shared import (
    _normalize_template_definition,
    _period_since,
    logger,
)

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Workflow Template
# ---------------------------------------------------------------------------

@router.get("/workflow-template")
async def get_workflow_template(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    tenant_id = ctx.get("tenant_id")
    record = await get_active_template(db, tenant_id)
    if not record:
        raise HTTPException(status_code=404, detail="Active workflow not found")
    record["definition"] = _normalize_template_definition(record.get("definition"))
    return record


# ---------------------------------------------------------------------------
# Overview & Analytics
# ---------------------------------------------------------------------------

@router.get("/overview")
async def overview(
    user_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    if user_id:
        lead_scope = "AND (assigned_to = :uid OR created_by = :uid)"
        contract_scope = "AND (sales_owner_id = :uid OR created_by = :uid)"
        order_scope = "AND o.contract_no IN (SELECT contract_no FROM crm_contracts WHERE sales_owner_id = :uid OR created_by = :uid)"
        approval_scope = "AND ap.order_id IN (SELECT o2.id FROM export_flow_orders o2 JOIN crm_contracts c2 ON c2.contract_no = o2.contract_no WHERE c2.sales_owner_id = :uid OR c2.created_by = :uid)"
        recv_scope = "AND (assigned_to = :uid)"
        pay_scope = "AND (assigned_to = :uid)"
        params: dict = {"uid": user_id}
    else:
        lead_scope = contract_scope = order_scope = approval_scope = recv_scope = pay_scope = ""
        params = {}

    r = await db.execute(text(f"""
        SELECT
            (SELECT COUNT(*) FROM leads WHERE status NOT IN ('converted','lost') AND duplicate_of IS NULL AND (is_cold IS NULL OR is_cold = FALSE) {lead_scope}),
            (SELECT COUNT(*) FROM leads WHERE last_contacted_at >= NOW() - INTERVAL '30 days' AND duplicate_of IS NULL AND (is_cold IS NULL OR is_cold = FALSE) AND status NOT IN ('lost') {lead_scope}),
            (SELECT COUNT(*) FROM crm_contracts WHERE 1=1 {contract_scope}),
            (SELECT COUNT(*) FROM export_flow_orders o WHERE o.stage NOT IN ('closed','cancelled') {order_scope}),
            (SELECT COUNT(*) FROM export_flow_approvals ap WHERE ap.status = 'pending' {approval_scope}),
            (SELECT COALESCE(SUM(amount - received_amount), 0) FROM crm_receivables WHERE status NOT IN ('closed', 'paid') {recv_scope}),
            (SELECT COALESCE(SUM(amount - paid_amount), 0) FROM crm_payables WHERE status != 'paid' {pay_scope})
    """), params)
    row = r.fetchone()
    return {
        "leads_open": row[0] or 0,
        "accounts_active": row[1] or 0,
        "contracts_total": row[2] or 0,
        "orders_running": row[3] or 0,
        "approvals_pending": row[4] or 0,
        "receivable_outstanding": float(row[5] or 0),
        "payable_outstanding": float(row[6] or 0),
    }


@router.get("/analytics/leads-trend")
async def leads_trend(
    period: str = "day",
    scope: str = "all",
    user_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    since, trunc = _period_since(period)
    params: dict = {"since": since}
    scope_sql = "1=1"
    if user_id:
        scope_sql = "(assigned_to = :uid OR created_by = :uid)"
        params["uid"] = user_id
    elif scope == "mine":
        scope_sql = "(assigned_to = :uid OR created_by = :uid)"
        params["uid"] = ctx["sub"]
    rows = await db.execute(
        text(f"""
            SELECT DATE_TRUNC('{trunc}', created_at)::date AS period, COUNT(*) AS count
            FROM leads
            WHERE created_at >= :since AND {scope_sql}
            GROUP BY 1 ORDER BY 1
        """),
        params,
    )
    return [{"period": str(r.period), "count": int(r.count)} for r in rows.fetchall()]


@router.get("/analytics/unfollowed")
async def unfollowed_trend(
    period: str = "day",
    scope: str = "all",
    user_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    since, trunc = _period_since(period)
    params: dict = {"since": since}
    scope_sql = "1=1"
    if user_id:
        scope_sql = "(assigned_to = :uid OR created_by = :uid)"
        params["uid"] = user_id
    elif scope == "mine":
        scope_sql = "(assigned_to = :uid OR created_by = :uid)"
        params["uid"] = ctx["sub"]
    rows = await db.execute(
        text(f"""
            SELECT DATE_TRUNC('{trunc}', created_at)::date AS period, COUNT(*) AS count
            FROM leads
            WHERE created_at >= :since
              AND follow_up_status = 'pending'
              AND {scope_sql}
            GROUP BY 1 ORDER BY 1
        """),
        params,
    )
    return [{"period": str(r.period), "count": int(r.count)} for r in rows.fetchall()]


@router.get("/analytics/funnel")
async def analytics_funnel(
    period: str = "all",
    scope: str = "all",
    user_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    time_sql = "1=1"
    if period == "week":
        time_sql = "created_at >= NOW() - INTERVAL '7 days'"
    elif period == "month":
        time_sql = "created_at >= NOW() - INTERVAL '30 days'"
    elif period == "year":
        time_sql = "created_at >= NOW() - INTERVAL '365 days'"
    params: dict = {}
    scope_sql = "1=1"
    if user_id:
        scope_sql = "(assigned_to = :uid OR created_by = :uid)"
        params["uid"] = user_id
    elif scope == "mine":
        scope_sql = "(assigned_to = :uid OR created_by = :uid)"
        params["uid"] = ctx["sub"]
    lead_rows = await db.execute(
        text(f"SELECT status, COUNT(*) as count FROM leads WHERE {time_sql} AND {scope_sql} GROUP BY status"),
        params,
    )
    contract_rows = await db.execute(
        text("""
            SELECT status, COUNT(*) as count, COALESCE(SUM(contract_amount),0) as amount
            FROM crm_contracts GROUP BY status ORDER BY count DESC
        """)
    )
    return {
        "leads": {r.status: int(r.count) for r in lead_rows.fetchall()},
        "contracts": [{"stage": r.status, "count": int(r.count), "value": float(r.amount)} for r in contract_rows.fetchall()],
    }


# ---------------------------------------------------------------------------
# Lead AI
# ---------------------------------------------------------------------------

@router.post("/leads/{lead_id}/ai-analyze")
async def analyze_lead_ai(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    from app.services.ai.gemini import get_personalized_system_instruction
    from app.services.ai.provider import generate_text_for_tenant

    res = await db.execute(text("SELECT * FROM leads WHERE id = :id"), {"id": lead_id})
    lead = res.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    prompt = f"""
    Analyze this business lead and provide a concise strategic summary (2-3 sentences).
    Name: {lead.full_name}
    Company: {lead.company}
    Source: {lead.source}
    Status: {lead.status}
    Context: {lead.ai_summary or "No initial context."}

    Identify potential business value and recommended next step.
    """

    system_ins = await get_personalized_system_instruction(ctx["sub"], db, "You are a professional CRM analyst.")
    analysis = await generate_text_for_tenant(db, ctx["tenant_id"], prompt, system_instruction=system_ins)

    await db.execute(
        text("UPDATE leads SET ai_summary = :summary WHERE id = :id"),
        {"summary": analysis, "id": lead_id}
    )
    await db.commit()

    return {"analysis": analysis}
