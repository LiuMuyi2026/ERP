from datetime import date as date_type, datetime, timedelta, timezone
from decimal import Decimal
import json
import logging
import re
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

logger = logging.getLogger(__name__)

from app.deps import get_current_user_with_tenant
from app.services.ai.deduplication import check_duplicate_lead
from app.services.ai.company_research import research_company
from app.services.workflow_actions import trigger_workflow_actions
from app.services.workflow_templates import get_active_template, get_effective_template
from app.utils.sql import build_update_clause, parse_date_strict

router = APIRouter(prefix="/crm", tags=["crm"])

# ---------------------------------------------------------------------------
# Allowed-field whitelists for dynamic UPDATE queries
# ---------------------------------------------------------------------------
_LEAD_UPDATE_FIELDS = {
    "full_name", "email", "phone", "whatsapp", "company", "title", "source",
    "status", "follow_up_status", "ai_summary", "assigned_to", "is_cold",
    "cold_lead_reason", "custom_fields", "country", "contract_value", "currency",
    "familiarity_stage",
}

_CONTRACT_UPDATE_FIELDS = {
    "contract_no", "account_id", "contract_amount", "currency", "payment_terms",
    "sign_date", "status", "eta", "risk_level", "incoterm", "remarks",
    "order_id", "updated_at",
}

_RECEIVABLE_UPDATE_FIELDS = {
    "due_date", "amount", "currency", "received_amount", "status",
    "payment_proof_url", "notes", "invoice_no", "lead_id", "assigned_to",
    "updated_at",
}

_LEAD_PROFILE_FIELDS = {
    "full_name", "email", "phone", "whatsapp", "company", "title", "source",
    "status", "follow_up_status", "country", "contract_value", "currency",
    "assigned_to", "custom_fields",
}


def _normalize_template_definition(definition: Optional[dict]) -> dict:
    if isinstance(definition, str):
        try:
            return json.loads(definition)
        except json.JSONDecodeError:
            return {}
    if isinstance(definition, dict):
        return definition
    return {}


DEFAULT_OPERATION_TASKS = [
    ("factory_inspection", "出厂验货（厂检）", "业务员", True),
    ("statutory_inspection", "法检/商检预约与跟进", "单证员", True),
    ("packing_details", "催要货物明细并制作分箱明细", "单证员", True),
    ("purchase_inbound", "高达采购入库登记", "单证员", False),
    ("final_payment_invoice", "付尾款、发票核验与登记", "单证员/出纳员", True),
    ("delivery_notice", "送货通知签字并发送供应商", "业务员/单证员", True),
    ("godad_billing", "发货当月高达开单", "单证员", False),
    ("goods_receipt_confirmation", "确认接货数量与包装质量", "业务员", True),
    ("customs_declaration", "报关资料制作与发送货代", "单证员", True),
    ("clearance_and_photos", "确认通关并索要装箱/装船照片", "业务员/单证员", True),
    ("shipment_notice", "开船后2个工作日内制作装船通知", "单证员", True),
    ("docs_preparation", "议付单据与附件制作并发送业务员", "单证员", True),
    ("docs_tracking", "交单跟踪登记《TRACKING》", "单证员", True),
        ("payment_followup", "回款/LC到款跟进", "业务员/单证员/出纳员", True),
]


def _normalize_email(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = value.strip().lower()
    return v or None


def _normalize_phone_token(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    digits = re.sub(r"[^0-9]", "", value)
    return digits or None


def _build_whatsapp_tokens(value: Optional[str]) -> list[str]:
    if not value:
        return []
    raw = value.strip()
    candidates: set[str] = set()
    digit_only = _normalize_phone_token(raw)
    if digit_only:
        candidates.add(digit_only)
    if "@" in raw:
        jid_prefix = raw.split("@", 1)[0]
        jid_digits = _normalize_phone_token(jid_prefix)
        if jid_digits:
            candidates.add(jid_digits)
    return list(candidates)


async def _auto_link_communications_for_lead(
    db,
    lead_id: str,
    email: Optional[str],
    whatsapp: Optional[str],
) -> None:
    email_norm = _normalize_email(email)
    wa_tokens = _build_whatsapp_tokens(whatsapp)

    if wa_tokens:
        await db.execute(
            text(
                """
                UPDATE whatsapp_contacts
                SET lead_id = CAST(:lid AS uuid), updated_at = NOW()
                WHERE (lead_id IS NULL OR lead_id = CAST(:lid AS uuid))
                  AND (
                    regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g') = ANY(:wa_tokens)
                    OR regexp_replace(split_part(COALESCE(wa_jid, ''), '@', 1), '[^0-9]', '', 'g') = ANY(:wa_tokens)
                  )
                """
            ),
            {"lid": lead_id, "wa_tokens": wa_tokens},
        )

    if email_norm:
        await db.execute(
            text(
                """
                UPDATE emails
                SET lead_id = CAST(:lid AS uuid), updated_at = NOW()
                WHERE (lead_id IS NULL OR lead_id = CAST(:lid AS uuid))
                  AND (
                    LOWER(COALESCE(from_email, '')) = :email
                    OR LOWER(COALESCE(to_email, '')) = :email
                  )
                """
            ),
            {"lid": lead_id, "email": email_norm},
        )


@router.get("/workflow-template")
async def get_workflow_template(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    tenant_id = ctx.get("tenant_id")
    record = await get_active_template(db, tenant_id)
    if not record:
        raise HTTPException(status_code=404, detail="Active workflow not found")
    record["definition"] = _normalize_template_definition(record.get("definition"))
    return record


class LeadCreate(BaseModel):
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    source: Optional[str] = "manual"
    status: str = "new"
    follow_up_status: str = "pending"
    assigned_to: Optional[str] = None
    custom_fields: Optional[dict] = None


class LeadUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = None
    follow_up_status: Optional[str] = None
    ai_summary: Optional[str] = None
    familiarity_stage: Optional[str] = None


class AccountCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    country: Optional[str] = None
    credit_level: str = "normal"
    status: str = "active"
    notes: Optional[str] = None


class ContractCreate(BaseModel):
    contract_no: str
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    lead_id: Optional[str] = None
    contract_amount: Decimal = Decimal("0")
    currency: str = "USD"
    payment_method: Optional[str] = None
    incoterm: Optional[str] = None
    sign_date: Optional[str] = None
    eta: Optional[str] = None
    status: str = "draft"
    risk_level: str = "normal"
    remarks: Optional[str] = None
    create_operation_order: bool = True


class ContractUpdate(BaseModel):
    account_id: Optional[str] = None
    contract_amount: Optional[Decimal] = None
    currency: Optional[str] = None
    payment_method: Optional[str] = None
    incoterm: Optional[str] = None
    sign_date: Optional[str] = None
    eta: Optional[str] = None
    status: Optional[str] = None
    risk_level: Optional[str] = None
    remarks: Optional[str] = None


class ReceivableCreate(BaseModel):
    contract_id: str
    due_date: Optional[str] = None
    amount: Decimal = Decimal("0")
    currency: str = "USD"
    received_amount: Decimal = Decimal("0")
    status: str = "open"
    payment_proof_url: Optional[str] = None
    notes: Optional[str] = None
    invoice_no: Optional[str] = None
    lead_id: Optional[str] = None
    assigned_to: Optional[str] = None


class ReceivableUpdate(BaseModel):
    due_date: Optional[str] = None
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    received_amount: Optional[Decimal] = None
    status: Optional[str] = None
    payment_proof_url: Optional[str] = None
    notes: Optional[str] = None
    invoice_no: Optional[str] = None
    lead_id: Optional[str] = None
    assigned_to: Optional[str] = None


class PaymentCreate(BaseModel):
    amount: Decimal
    payment_date: Optional[str] = None
    payment_proof_url: Optional[str] = None
    payment_proof_name: Optional[str] = None
    notes: Optional[str] = None


class PayableCreate(BaseModel):
    contract_id: str
    due_date: Optional[str] = None
    amount: Decimal = Decimal("0")
    currency: str = "USD"
    paid_amount: Decimal = Decimal("0")
    status: str = "unpaid"
    notes: Optional[str] = None
    invoice_no: Optional[str] = None
    supplier_name: Optional[str] = None
    assigned_to: Optional[str] = None


class PayableUpdate(BaseModel):
    due_date: Optional[str] = None
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    paid_amount: Optional[Decimal] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    invoice_no: Optional[str] = None
    supplier_name: Optional[str] = None
    assigned_to: Optional[str] = None


class PayablePaymentCreate(BaseModel):
    amount: Decimal
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None
    reference_no: Optional[str] = None
    payment_proof_url: Optional[str] = None
    payment_proof_name: Optional[str] = None
    notes: Optional[str] = None


_PAYABLE_UPDATE_FIELDS = {
    "due_date", "amount", "currency", "paid_amount", "status",
    "notes", "invoice_no", "supplier_name", "assigned_to",
    "updated_at",
}


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


def _period_since(period: str):
    now = datetime.utcnow()
    if period == "week":
        return now - timedelta(weeks=13), "week"
    if period == "month":
        return now - timedelta(days=365), "month"
    return now - timedelta(days=30), "day"


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


@router.post("/leads/{lead_id}/ai-analyze")
async def analyze_lead_ai(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """AI Autofill 风格接口：自动分析线索详情。"""
    db = ctx["db"]
    from app.services.ai.gemini import get_personalized_system_instruction
    from app.services.ai.provider import generate_text_for_tenant

    # 获取线索详情
    res = await db.execute(text("SELECT * FROM leads WHERE id = :id"), {"id": lead_id})
    lead = res.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # 构造提示词
    prompt = f"""
    Analyze this business lead and provide a concise strategic summary (2-3 sentences).
    Name: {lead.full_name}
    Company: {lead.company}
    Source: {lead.source}
    Status: {lead.status}
    Context: {lead.ai_summary or "No initial context."}

    Identify potential business value and recommended next step.
    """

    # 获取个性化系统指令
    system_ins = await get_personalized_system_instruction(ctx["sub"], db, "You are a professional CRM analyst.")

    analysis = await generate_text_for_tenant(db, ctx["tenant_id"], prompt, system_instruction=system_ins)
    
    # 更新到数据库
    await db.execute(
        text("UPDATE leads SET ai_summary = :summary WHERE id = :id"),
        {"summary": analysis, "id": lead_id}
    )
    await db.commit()
    
    return {"analysis": analysis}

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
    """Check if a lead already exists by name, email, or whatsapp."""
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

    # Check for active (ongoing) leads among the matches
    active_statuses = {"new", "inquiry", "replied", "quoted", "engaged", "qualified", "negotiating", "fulfillment"}
    has_active = any(m.get("status") in active_statuses for m in matches)

    return {"matches": matches, "has_active": has_active}


@router.patch("/leads/{lead_id}/cold")
async def mark_cold_lead(lead_id: str, body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    """Mark a lead as cold with a mandatory reason."""
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
    """Restore a cold lead back to normal (inquiry status)."""
    db = ctx["db"]
    await db.execute(
        text("UPDATE leads SET is_cold = FALSE, cold_lead_reason = NULL, status = 'inquiry', updated_at = NOW() WHERE id = :id AND is_cold = TRUE"),
        {"id": lead_id},
    )
    await db.commit()
    return {"status": "restored"}


@router.get("/todos")
async def get_todos(ctx: dict = Depends(get_current_user_with_tenant)):
    """Get pending todo items for the current user: leads needing action."""
    db = ctx["db"]
    user_id = ctx["sub"]
    todos = []

    # 1. Leads assigned to me with follow_up_status = 'pending' (exclude cold)
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

    # 2. Leads assigned to me in early stages with no interactions in 3+ days
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
    """Return all leads with a pending supply-chain price inquiry."""
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
        classify = steps.get("classify", {})
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
    """Add quotes or submit final price back to a lead's workflow.
    Uses jsonb_set to avoid overwriting concurrent salesperson edits."""
    db = ctx["db"]
    # Verify lead exists
    row = await db.execute(text("SELECT id FROM leads WHERE id = :id"), {"id": lead_id})
    if not row.fetchone():
        raise HTTPException(status_code=404, detail="Lead not found")

    if "quotes" in body:
        # Atomically set quotes using jsonb_set — won't touch the rest of workflow_data
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


@router.patch("/leads/{lead_id}/advance-stage")
async def advance_lead_stage(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Advance lead to next funnel stage."""
    db = ctx["db"]
    row = await db.execute(text("SELECT status FROM leads WHERE id = :id"), {"id": lead_id})
    lead = row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    current = lead.status
    NEXT_STAGE = {
        "inquiry": "quoted",
        "new": "quoted",
        "replied": "quoted",
        "contacted": "quoted",
        "quoted": "negotiating",
        "negotiating": "procuring",
        "procuring": "booking",
        "booking": "fulfillment",
        "fulfillment": "payment",
        "payment": "converted",
    }
    next_status = NEXT_STAGE.get(current)
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


@router.get("/accounts")
async def list_accounts(
    search: Optional[str] = None,
    user_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    params: dict = {}
    where_parts = ["1=1"]
    if search:
        where_parts.append("name ILIKE :search")
        params["search"] = f"%{search}%"
    if user_id:
        where_parts.append("(owner_id = :uid OR created_by = :uid)")
        params["uid"] = user_id
    where = " AND ".join(where_parts)
    rows = await ctx["db"].execute(text(f"SELECT * FROM crm_accounts WHERE {where} ORDER BY created_at DESC"), params)
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/accounts")
async def create_account(body: AccountCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    account_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text(
            """
            INSERT INTO crm_accounts (id, name, industry, country, credit_level, status, notes, created_by)
            VALUES (:id, :name, :industry, :country, :credit_level, :status, :notes, :created_by)
            """
        ),
        {**body.model_dump(), "id": account_id, "created_by": ctx["sub"]},
    )
    await ctx["db"].commit()
    return {"id": account_id}


@router.get("/contracts")
async def list_contracts(
    limit: int = 50,
    offset: int = 0,
    user_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    scope_sql = ""
    params: dict = {"limit": limit, "offset": offset}
    if user_id:
        scope_sql = "WHERE (c.sales_owner_id = :uid OR c.created_by = :uid)"
        params["uid"] = user_id

    rows = await ctx["db"].execute(
        text(
            f"""
            SELECT c.*,
                   a.name AS account_name,
                   COALESCE(ts.total_count, 0) AS task_total,
                   COALESCE(ts.done_count, 0) AS task_done,
                   COALESCE(rr.outstanding, 0) AS receivable_outstanding,
                   COALESCE(pp.outstanding, 0) AS payable_outstanding,
                   COALESCE(ap.pending_count, 0) AS approvals_pending
            FROM crm_contracts c
            LEFT JOIN crm_accounts a ON a.id = c.account_id
            LEFT JOIN (
                SELECT order_id, COUNT(*) AS total_count,
                       SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_count
                FROM export_flow_tasks
                GROUP BY order_id
            ) ts ON ts.order_id = c.order_id
            LEFT JOIN (
                SELECT contract_id, COALESCE(SUM(amount - received_amount), 0) AS outstanding
                FROM crm_receivables
                WHERE status != 'closed'
                GROUP BY contract_id
            ) rr ON rr.contract_id = c.id
            LEFT JOIN (
                SELECT contract_id, COALESCE(SUM(amount - paid_amount), 0) AS outstanding
                FROM crm_payables
                WHERE status != 'paid'
                GROUP BY contract_id
            ) pp ON pp.contract_id = c.id
            LEFT JOIN (
                SELECT o.contract_no, COUNT(*) AS pending_count
                FROM export_flow_approvals ap
                JOIN export_flow_orders o ON o.id = ap.order_id
                WHERE ap.status = 'pending'
                GROUP BY o.contract_no
            ) ap ON ap.contract_no = c.contract_no
            {scope_sql}
            ORDER BY c.created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/contracts")
async def create_contract(body: ContractCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    account_id = body.account_id

    if not account_id and body.account_name:
        account_id = str(uuid.uuid4())
        await db.execute(
            text("INSERT INTO crm_accounts (id, name, created_by) VALUES (:id, :name, :created_by)"),
            {"id": account_id, "name": body.account_name, "created_by": ctx["sub"]},
        )

    contract_id = str(uuid.uuid4())
    order_id: str | None = None

    if body.create_operation_order:
        existing = await db.execute(text("SELECT id FROM export_flow_orders WHERE contract_no = :contract_no"), {"contract_no": body.contract_no})
        existing_order = existing.fetchone()
        if existing_order:
            order_id = str(existing_order.id)
        else:
            order_id = str(uuid.uuid4())
            sale_amount_usd = body.contract_amount if (body.currency or "USD").upper() == "USD" else 0
            sale_amount_cny = body.contract_amount if (body.currency or "USD").upper() in ("CNY", "RMB") else 0
            await db.execute(
                text(
                    """
                    INSERT INTO export_flow_orders (
                        id, contract_no, customer_name, sale_amount_usd, sale_amount_cny,
                        payment_method, incoterm, destination_type, stage, created_by
                    ) VALUES (
                        :id, :contract_no, :customer_name, :sale_amount_usd, :sale_amount_cny,
                        :payment_method, :incoterm, 'port', 'pre_shipment', :created_by
                    )
                    """
                ),
                {
                    "id": order_id,
                    "contract_no": body.contract_no,
                    "customer_name": body.account_name,
                    "sale_amount_usd": sale_amount_usd,
                    "sale_amount_cny": sale_amount_cny,
                    "payment_method": body.payment_method,
                    "incoterm": body.incoterm,
                    "created_by": ctx["sub"],
                },
            )
            for code, title, owner_role, requires_attachment in DEFAULT_OPERATION_TASKS:
                await db.execute(
                    text(
                        """
                        INSERT INTO export_flow_tasks (id, order_id, code, title, owner_role, requires_attachment, created_by)
                        VALUES (:id, :order_id, :code, :title, :owner_role, :requires_attachment, :created_by)
                        """
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "order_id": order_id,
                        "code": code,
                        "title": title,
                        "owner_role": owner_role,
                        "requires_attachment": requires_attachment,
                        "created_by": ctx["sub"],
                    },
                )

    # Resolve sales_owner_id from the linked lead's assigned_to
    sales_owner_id = None
    if body.lead_id:
        owner_row = await db.execute(
            text("SELECT assigned_to FROM leads WHERE id = CAST(:lid AS uuid)"),
            {"lid": body.lead_id},
        )
        owner = owner_row.fetchone()
        if owner and owner.assigned_to:
            sales_owner_id = str(owner.assigned_to)
    if not sales_owner_id:
        sales_owner_id = ctx["sub"]

    await db.execute(
        text(
            """
            INSERT INTO crm_contracts (
                id, contract_no, account_id, lead_id, order_id, contract_amount, currency,
                payment_method, incoterm, sign_date, eta, status, risk_level, remarks,
                sales_owner_id, created_by
            ) VALUES (
                :id, :contract_no, :account_id, :lead_id, :order_id, :contract_amount, :currency,
                :payment_method, :incoterm, :sign_date, :eta, :status, :risk_level, :remarks,
                :sales_owner_id, :created_by
            )
            """
        ),
        {
            "id": contract_id,
            "contract_no": body.contract_no,
            "account_id": account_id,
            "lead_id": body.lead_id,
            "order_id": order_id,
            "contract_amount": body.contract_amount,
            "currency": body.currency,
            "payment_method": body.payment_method,
            "incoterm": body.incoterm,
            "sign_date": parse_date_strict(body.sign_date, "sign_date"),
            "eta": parse_date_strict(body.eta, "eta"),
            "status": body.status,
            "risk_level": body.risk_level,
            "remarks": body.remarks,
            "sales_owner_id": sales_owner_id,
            "created_by": ctx["sub"],
        },
    )

    # Auto-create a receivable record linked to this contract
    receivable_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO crm_receivables (
                id, contract_id, amount, currency, status, lead_id, assigned_to, created_by
            ) VALUES (
                :id, :contract_id, :amount, :currency, 'unpaid', :lead_id, :assigned_to, :created_by
            )
            """
        ),
        {
            "id": receivable_id,
            "contract_id": contract_id,
            "amount": body.contract_amount,
            "currency": body.currency,
            "lead_id": body.lead_id,
            "assigned_to": ctx["sub"],
            "created_by": ctx["sub"],
        },
    )

    await db.commit()
    return {"id": contract_id, "order_id": order_id, "receivable_id": receivable_id}


@router.patch("/contracts/{contract_id}")
async def update_contract(contract_id: str, body: ContractUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        return {"status": "no changes"}

    # Check old status before update
    old_row = await db.execute(text("SELECT status FROM crm_contracts WHERE id = :id"), {"id": contract_id})
    old = old_row.fetchone()
    old_status = old.status if old else None

    if "sign_date" in payload:
        payload["sign_date"] = parse_date_strict(payload["sign_date"], "sign_date")
    if "eta" in payload:
        payload["eta"] = parse_date_strict(payload["eta"], "eta")
    payload["updated_at"] = date_type.today()
    set_clause, params = build_update_clause(payload, _CONTRACT_UPDATE_FIELDS)
    if not set_clause:
        return {"status": "no changes"}
    params["id"] = contract_id
    await db.execute(text(f"UPDATE crm_contracts SET {set_clause} WHERE id = :id"), params)

    # Auto inventory deduction + GL posting when contract status changes to active
    new_status = payload.get("status")
    if new_status == "active" and old_status != "active":
        user_id = ctx.get("sub", "")
        await _deduct_inventory_for_contract(db, contract_id, user_id)
        await _contract_activation_gl_posting(db, contract_id, user_id)

    await db.commit()
    return {"status": "updated"}


@router.get("/contracts/{contract_id}")
async def get_contract(contract_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    row = await ctx["db"].execute(text("SELECT * FROM crm_contracts WHERE id = :id"), {"id": contract_id})
    contract = row.fetchone()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    return dict(contract._mapping)


@router.get("/contracts/{contract_id}/timeline")
async def contract_timeline(contract_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(text("SELECT * FROM crm_contracts WHERE id = :id"), {"id": contract_id})
    contract = row.fetchone()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    tasks, docs, approvals = [], [], []
    if contract.order_id:
        tasks_q = await db.execute(text("SELECT * FROM export_flow_tasks WHERE order_id = :id ORDER BY created_at"), {"id": contract.order_id})
        docs_q = await db.execute(text("SELECT * FROM export_flow_docs WHERE order_id = :id ORDER BY created_at DESC"), {"id": contract.order_id})
        approvals_q = await db.execute(text("SELECT * FROM export_flow_approvals WHERE order_id = :id ORDER BY requested_at DESC"), {"id": contract.order_id})
        tasks = [dict(r._mapping) for r in tasks_q.fetchall()]
        docs = [dict(r._mapping) for r in docs_q.fetchall()]
        approvals = [dict(r._mapping) for r in approvals_q.fetchall()]

    receivables_q = await db.execute(text("SELECT * FROM crm_receivables WHERE contract_id = :id ORDER BY due_date ASC"), {"id": contract_id})
    receivables = [dict(r._mapping) for r in receivables_q.fetchall()]

    payables_q = await db.execute(text("SELECT * FROM crm_payables WHERE contract_id = :id ORDER BY due_date ASC"), {"id": contract_id})
    payables = [dict(r._mapping) for r in payables_q.fetchall()]

    return {
        "contract": dict(contract._mapping),
        "tasks": tasks,
        "docs": docs,
        "approvals": approvals,
        "receivables": receivables,
        "payables": payables,
    }


# ── Contract Line Items ────────────────────────────────────────────────────────

class ContractLineItemCreate(BaseModel):
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    quantity: float = 0
    unit_price: float = 0
    notes: Optional[str] = None


@router.get("/contracts/{contract_id}/line-items")
async def list_contract_line_items(contract_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    rows = await db.execute(
        text("""
            SELECT li.*, p.sku AS product_sku, p.current_stock AS product_stock
            FROM contract_line_items li
            LEFT JOIN products p ON p.id = li.product_id
            WHERE li.contract_id = :cid
            ORDER BY li.created_at
        """),
        {"cid": contract_id},
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/contracts/{contract_id}/line-items")
async def create_contract_line_item(contract_id: str, body: ContractLineItemCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    item_id = str(uuid.uuid4())
    amount = round(body.quantity * body.unit_price, 4)
    await db.execute(
        text("""
            INSERT INTO contract_line_items (id, contract_id, product_id, product_name, quantity, unit_price, amount, notes)
            VALUES (:id, CAST(:cid AS uuid),
                    CASE WHEN :pid = '' OR :pid IS NULL THEN NULL ELSE CAST(:pid AS uuid) END,
                    :pname, :qty, :uprice, :amount, :notes)
        """),
        {
            "id": item_id, "cid": contract_id,
            "pid": body.product_id or "",
            "pname": body.product_name or "",
            "qty": body.quantity, "uprice": body.unit_price,
            "amount": amount, "notes": body.notes or "",
        },
    )
    await db.commit()
    return {"id": item_id, "amount": amount}


@router.delete("/contracts/{contract_id}/line-items/{item_id}")
async def delete_contract_line_item(contract_id: str, item_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(
        text("DELETE FROM contract_line_items WHERE id = :id AND contract_id = CAST(:cid AS uuid)"),
        {"id": item_id, "cid": contract_id},
    )
    await ctx["db"].commit()
    return {"status": "deleted"}


# ── Cross-module helpers ──────────────────────────────────────────────────────

async def _ensure_gl_accounts(db):
    """Ensure required GL accounts exist, return {code: id}."""
    required = {
        "1300": ("存货", "asset", "current_asset"),
        "2001": ("应付账款", "liability", "current_liability"),
        "5001": ("销售成本", "expense", "cost"),
    }
    accounts = {}
    for code, (name, category, acc_type) in required.items():
        row = await db.execute(text("SELECT id FROM chart_of_accounts WHERE code = :code"), {"code": code})
        existing = row.fetchone()
        if existing:
            accounts[code] = str(existing.id)
        else:
            acc_id = str(uuid.uuid4())
            await db.execute(text(
                "INSERT INTO chart_of_accounts (id, code, name, category, type) VALUES (:id, :code, :name, :cat, :type)"
            ), {"id": acc_id, "code": code, "name": name, "cat": category, "type": acc_type})
            accounts[code] = acc_id
    return accounts


async def _deduct_inventory_for_contract(db, contract_id: str, user_id: str):
    """Auto-deduct inventory when contract is activated."""
    rows = await db.execute(
        text("SELECT product_id, quantity FROM contract_line_items WHERE contract_id = CAST(:cid AS uuid) AND product_id IS NOT NULL"),
        {"cid": contract_id},
    )
    items = rows.fetchall()
    if not items:
        return

    for item in items:
        # Idempotency: check per product
        dup = await db.execute(
            text("""SELECT id FROM stock_movements
                    WHERE reference_type = 'contract' AND reference_id = CAST(:rid AS uuid) AND product_id = :pid"""),
            {"rid": contract_id, "pid": str(item.product_id)},
        )
        if dup.fetchone():
            continue

        qty = float(item.quantity)
        if qty <= 0:
            continue

        mv_id = str(uuid.uuid4())
        await db.execute(
            text("""
                INSERT INTO stock_movements (id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
                VALUES (:id, :pid, 'sales_deduction', :qty, 'contract', CAST(:rid AS uuid), 'Auto from contract activation',
                        CASE WHEN :uid = '' THEN NULL ELSE CAST(:uid AS uuid) END)
            """),
            {"id": mv_id, "pid": str(item.product_id), "qty": -qty, "rid": contract_id, "uid": user_id},
        )
        await db.execute(
            text("UPDATE products SET current_stock = current_stock - :qty, updated_at = NOW() WHERE id = :pid"),
            {"qty": qty, "pid": str(item.product_id)},
        )


async def _contract_activation_gl_posting(db, contract_id: str, user_id: str):
    """Auto GL posting: Dr. COGS, Cr. Inventory when contract is activated."""
    rows = await db.execute(
        text("""
            SELECT li.quantity, COALESCE(p.cost_price, 0) AS cost_price
            FROM contract_line_items li
            JOIN products p ON p.id = li.product_id
            WHERE li.contract_id = CAST(:cid AS uuid) AND li.product_id IS NOT NULL
        """),
        {"cid": contract_id},
    )
    items = rows.fetchall()
    total_cost = sum(float(i.quantity) * float(i.cost_price) for i in items)
    if total_cost <= 0:
        return

    # Idempotency check
    dup = await db.execute(
        text("SELECT id FROM journal_entries WHERE reference_type = 'contract' AND reference_id = CAST(:rid AS uuid)"),
        {"rid": contract_id},
    )
    if dup.fetchone():
        return

    accounts = await _ensure_gl_accounts(db)
    r = await db.execute(text("SELECT COUNT(*) FROM journal_entries"))
    count = r.scalar()
    entry_number = f"JE-{(count + 1):05d}"
    entry_id = str(uuid.uuid4())

    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS journal_entry_lines (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entry_id UUID NOT NULL, account_id UUID,
            account_code VARCHAR(30), account_name VARCHAR(255), description VARCHAR(500),
            debit NUMERIC(19,4) DEFAULT 0.0, credit NUMERIC(19,4) DEFAULT 0.0
        )
    """))

    await db.execute(
        text("""INSERT INTO journal_entries (id, entry_number, date, description, status, total_debit, total_credit,
                    reference_type, reference_id, created_by)
                VALUES (:id, :num, CURRENT_DATE, :desc, 'posted', :amount, :amount,
                    'contract', CAST(:rid AS uuid),
                    CASE WHEN :uid = '' THEN NULL ELSE CAST(:uid AS uuid) END)"""),
        {"id": entry_id, "num": entry_number, "desc": f"Contract activation COGS: {contract_id}",
         "amount": total_cost, "rid": contract_id, "uid": user_id},
    )
    # Dr. 5001 COGS
    await db.execute(
        text("INSERT INTO journal_entry_lines (id, entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (:id, :eid, :aid, '5001', '销售成本', 'Contract COGS', :amt, 0)"),
        {"id": str(uuid.uuid4()), "eid": entry_id, "aid": accounts["5001"], "amt": total_cost},
    )
    # Cr. 1300 Inventory
    await db.execute(
        text("INSERT INTO journal_entry_lines (id, entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (:id, :eid, :aid, '1300', '存货', 'Contract COGS', 0, :amt)"),
        {"id": str(uuid.uuid4()), "eid": entry_id, "aid": accounts["1300"], "amt": total_cost},
    )


@router.get("/receivables")
async def list_receivables(
    user_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    scope_sql = ""
    params: dict = {}
    if user_id:
        scope_sql = "WHERE r.assigned_to = :uid"
        params["uid"] = user_id

    rows = await ctx["db"].execute(
        text(
            f"""
            SELECT r.*, c.contract_no,
                   l.full_name AS lead_name,
                   u.full_name AS assigned_name
            FROM crm_receivables r
            JOIN crm_contracts c ON c.id = r.contract_id
            LEFT JOIN leads l ON l.id = r.lead_id
            LEFT JOIN users u ON u.id = r.assigned_to
            {scope_sql}
            ORDER BY COALESCE(r.due_date, CURRENT_DATE) ASC
            """
        ),
        params,
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/receivables")
async def create_receivable(body: ReceivableCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    receivable_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text(
            """
            INSERT INTO crm_receivables (
                id, contract_id, due_date, amount, currency, received_amount,
                status, payment_proof_url, notes, invoice_no, lead_id, assigned_to, created_by
            ) VALUES (
                :id, :contract_id, :due_date, :amount, :currency, :received_amount,
                :status, :payment_proof_url, :notes, :invoice_no, :lead_id, :assigned_to, :created_by
            )
            """
        ),
        {
            "id": receivable_id,
            "contract_id": body.contract_id,
            "due_date": parse_date_strict(body.due_date, "due_date"),
            "amount": body.amount,
            "currency": body.currency,
            "received_amount": body.received_amount,
            "status": body.status,
            "payment_proof_url": body.payment_proof_url,
            "notes": body.notes,
            "invoice_no": body.invoice_no,
            "lead_id": body.lead_id,
            "assigned_to": body.assigned_to,
            "created_by": ctx["sub"],
        },
    )
    await ctx["db"].commit()
    return {"id": receivable_id}


@router.patch("/receivables/{receivable_id}")
async def update_receivable(receivable_id: str, body: ReceivableUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        return {"status": "no changes"}
    if "due_date" in payload:
        payload["due_date"] = parse_date_strict(payload["due_date"], "due_date")
    payload["updated_at"] = date_type.today()
    set_clause, params = build_update_clause(payload, _RECEIVABLE_UPDATE_FIELDS)
    if not set_clause:
        return {"status": "no changes"}
    params["id"] = receivable_id
    await ctx["db"].execute(text(f"UPDATE crm_receivables SET {set_clause} WHERE id = :id"), params)
    await ctx["db"].commit()
    return {"status": "updated"}


# ---------------------------------------------------------------------------
# Receivable Payments (batch payment records)
# ---------------------------------------------------------------------------

@router.get("/receivables/{receivable_id}/payments")
async def list_payments(receivable_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    rows = await ctx["db"].execute(
        text(
            """
            SELECT p.*, u.full_name AS created_by_name
            FROM crm_receivable_payments p
            LEFT JOIN users u ON u.id = p.created_by
            WHERE p.receivable_id = :rid
            ORDER BY p.created_at ASC
            """
        ),
        {"rid": receivable_id},
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/receivables/{receivable_id}/payments")
async def add_payment(receivable_id: str, body: PaymentCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # Verify receivable exists
    rec = (await db.execute(text("SELECT id, amount, received_amount FROM crm_receivables WHERE id = :id"), {"id": receivable_id})).fetchone()
    if not rec:
        raise HTTPException(status_code=404, detail="Receivable not found")

    payment_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO crm_receivable_payments (id, receivable_id, amount, payment_date, payment_proof_url, payment_proof_name, notes, created_by)
            VALUES (:id, :rid, :amount, :payment_date, :proof_url, :proof_name, :notes, :created_by)
            """
        ),
        {
            "id": payment_id,
            "rid": receivable_id,
            "amount": body.amount,
            "payment_date": parse_date_strict(body.payment_date, "payment_date") if body.payment_date else date_type.today(),
            "proof_url": body.payment_proof_url,
            "proof_name": body.payment_proof_name,
            "notes": body.notes,
            "created_by": ctx["sub"],
        },
    )

    # Update received_amount and status on the receivable
    new_received = Decimal(rec.received_amount or 0) + body.amount
    total_amount = Decimal(rec.amount or 0)
    if total_amount > 0 and new_received >= total_amount:
        new_status = "paid"
    elif new_received > 0:
        new_status = "partial"
    else:
        new_status = "unpaid"

    await db.execute(
        text("UPDATE crm_receivables SET received_amount = :received, status = :status, updated_at = NOW() WHERE id = :id"),
        {"received": new_received, "status": new_status, "id": receivable_id},
    )
    await db.commit()
    return {"id": payment_id, "new_received_amount": float(new_received), "new_status": new_status}


@router.patch("/receivable-payments/{payment_id}/proof")
async def update_payment_proof(payment_id: str, body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    url = body.get("payment_proof_url")
    name = body.get("payment_proof_name")
    if not url:
        raise HTTPException(status_code=400, detail="payment_proof_url is required")
    await db.execute(
        text("UPDATE crm_receivable_payments SET payment_proof_url = :url, payment_proof_name = :name WHERE id = :id"),
        {"url": url, "name": name, "id": payment_id},
    )
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# CRM Payables (symmetric to Receivables)
# ---------------------------------------------------------------------------

@router.get("/payables")
async def list_payables(
    user_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    scope_sql = ""
    params: dict = {}
    if user_id:
        scope_sql = "WHERE p.assigned_to = :uid"
        params["uid"] = user_id

    rows = await ctx["db"].execute(
        text(
            f"""
            SELECT p.*, c.contract_no,
                   u.full_name AS assigned_name
            FROM crm_payables p
            JOIN crm_contracts c ON c.id = p.contract_id
            LEFT JOIN users u ON u.id = p.assigned_to
            {scope_sql}
            ORDER BY COALESCE(p.due_date, CURRENT_DATE) ASC
            """
        ),
        params,
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/payables")
async def create_payable(body: PayableCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    payable_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text(
            """
            INSERT INTO crm_payables (
                id, contract_id, due_date, amount, currency, paid_amount,
                status, notes, invoice_no, supplier_name, assigned_to, created_by
            ) VALUES (
                :id, :contract_id, :due_date, :amount, :currency, :paid_amount,
                :status, :notes, :invoice_no, :supplier_name, :assigned_to, :created_by
            )
            """
        ),
        {
            "id": payable_id,
            "contract_id": body.contract_id,
            "due_date": parse_date_strict(body.due_date, "due_date"),
            "amount": body.amount,
            "currency": body.currency,
            "paid_amount": body.paid_amount,
            "status": body.status,
            "notes": body.notes,
            "invoice_no": body.invoice_no,
            "supplier_name": body.supplier_name,
            "assigned_to": body.assigned_to,
            "created_by": ctx["sub"],
        },
    )
    await ctx["db"].commit()
    return {"id": payable_id}


@router.patch("/payables/{payable_id}")
async def update_payable(payable_id: str, body: PayableUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        return {"status": "no changes"}
    if "due_date" in payload:
        payload["due_date"] = parse_date_strict(payload["due_date"], "due_date")
    payload["updated_at"] = date_type.today()
    set_clause, params = build_update_clause(payload, _PAYABLE_UPDATE_FIELDS)
    if not set_clause:
        return {"status": "no changes"}
    params["id"] = payable_id
    await ctx["db"].execute(text(f"UPDATE crm_payables SET {set_clause} WHERE id = :id"), params)
    await ctx["db"].commit()
    return {"status": "updated"}


@router.get("/payables/{payable_id}/payments")
async def list_payable_payments(payable_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    rows = await ctx["db"].execute(
        text(
            """
            SELECT p.*, u.full_name AS created_by_name
            FROM crm_payable_payments p
            LEFT JOIN users u ON u.id = p.created_by
            WHERE p.payable_id = :pid
            ORDER BY p.created_at ASC
            """
        ),
        {"pid": payable_id},
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/payables/{payable_id}/payments")
async def add_payable_payment(payable_id: str, body: PayablePaymentCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    rec = (await db.execute(text("SELECT id, amount, paid_amount FROM crm_payables WHERE id = :id"), {"id": payable_id})).fetchone()
    if not rec:
        raise HTTPException(status_code=404, detail="Payable not found")

    payment_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO crm_payable_payments (id, payable_id, amount, payment_date, payment_method, reference_no, payment_proof_url, payment_proof_name, notes, created_by)
            VALUES (:id, :pid, :amount, :payment_date, :payment_method, :reference_no, :proof_url, :proof_name, :notes, :created_by)
            """
        ),
        {
            "id": payment_id,
            "pid": payable_id,
            "amount": body.amount,
            "payment_date": parse_date_strict(body.payment_date, "payment_date") if body.payment_date else date_type.today(),
            "payment_method": body.payment_method,
            "reference_no": body.reference_no,
            "proof_url": body.payment_proof_url,
            "proof_name": body.payment_proof_name,
            "notes": body.notes,
            "created_by": ctx["sub"],
        },
    )

    new_paid = Decimal(rec.paid_amount or 0) + body.amount
    total_amount = Decimal(rec.amount or 0)
    if total_amount > 0 and new_paid >= total_amount:
        new_status = "paid"
    elif new_paid > 0:
        new_status = "partial"
    else:
        new_status = "unpaid"

    await db.execute(
        text("UPDATE crm_payables SET paid_amount = :paid, status = :status, updated_at = NOW() WHERE id = :id"),
        {"paid": new_paid, "status": new_status, "id": payable_id},
    )
    await db.commit()
    return {"id": payment_id, "new_paid_amount": float(new_paid), "new_status": new_status}


@router.patch("/payable-payments/{payment_id}/proof")
async def update_payable_payment_proof(payment_id: str, body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    url = body.get("payment_proof_url")
    name = body.get("payment_proof_name")
    if not url:
        raise HTTPException(status_code=400, detail="payment_proof_url is required")
    await db.execute(
        text("UPDATE crm_payable_payments SET payment_proof_url = :url, payment_proof_name = :name WHERE id = :id"),
        {"url": url, "name": name, "id": payment_id},
    )
    await db.commit()
    return {"ok": True}


@router.get("/customer-360/{lead_id}")
async def customer_360(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    lead_q = await db.execute(
        text("""
            SELECT l.*, u.full_name AS assigned_to_name
            FROM leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE l.id = :id
        """),
        {"id": lead_id},
    )
    lead = lead_q.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead_dict = dict(lead._mapping)

    interactions_q = await db.execute(
        text("""
            SELECT i.*, u.full_name AS created_by_name
            FROM interactions i
            LEFT JOIN users u ON u.id = i.created_by
            WHERE i.lead_id = :lead_id
            ORDER BY i.created_at DESC
        """),
        {"lead_id": lead_id},
    )
    interactions = [dict(r._mapping) for r in interactions_q.fetchall()]

    contracts_q = await db.execute(
        text("""
            SELECT c.*,
                   COALESCE(a.name, '') AS account_label,
                   COALESCE(rr.total, 0) AS receivable_total,
                   COALESCE(rr.received, 0) AS receivable_received,
                   COALESCE(pp.total, 0) AS payable_total,
                   COALESCE(pp.paid, 0) AS payable_paid
            FROM crm_contracts c
            LEFT JOIN crm_accounts a ON a.id = c.account_id
            LEFT JOIN (
                SELECT contract_id, SUM(amount) AS total, SUM(received_amount) AS received
                FROM crm_receivables GROUP BY contract_id
            ) rr ON rr.contract_id = c.id
            LEFT JOIN (
                SELECT contract_id, SUM(amount) AS total, SUM(paid_amount) AS paid
                FROM crm_payables GROUP BY contract_id
            ) pp ON pp.contract_id = c.id
            WHERE c.lead_id = :lead_id
            ORDER BY c.created_at DESC
        """),
        {"lead_id": lead_id},
    )
    contracts = [dict(r._mapping) for r in contracts_q.fetchall()]

    audit_q = await db.execute(
        text("""
            SELECT al.*, u.full_name AS user_name, u.email AS user_email_addr
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.user_id
            WHERE al.resource_type = 'lead' AND al.resource_id = :lead_id
            ORDER BY al.created_at DESC
            LIMIT 100
        """),
        {"lead_id": lead_id},
    )
    audit_logs = [dict(r._mapping) for r in audit_q.fetchall()]

    # Related leads: same person identified by email, whatsapp, or full name
    related_conditions = []
    related_params: dict = {"lead_id": lead_id}
    email = lead_dict.get("email") or ""
    whatsapp = lead_dict.get("whatsapp") or ""
    full_name = lead_dict.get("full_name") or ""
    if email:
        related_conditions.append("(l.email IS NOT NULL AND l.email != '' AND l.email = :email)")
        related_params["email"] = email
    if whatsapp:
        related_conditions.append("(l.whatsapp IS NOT NULL AND l.whatsapp != '' AND l.whatsapp = :whatsapp)")
        related_params["whatsapp"] = whatsapp
    if full_name and not email and not whatsapp:
        related_conditions.append("l.full_name = :full_name")
        related_params["full_name"] = full_name

    related_leads: list = []
    if related_conditions:
        related_q = await db.execute(
            text(f"""
                SELECT l.*, u.full_name AS assigned_to_name
                FROM leads l
                LEFT JOIN users u ON u.id = l.assigned_to
                WHERE l.id != :lead_id
                AND ({" OR ".join(related_conditions)})
                ORDER BY l.created_at DESC
                LIMIT 50
            """),
            related_params,
        )
        related_leads = [dict(r._mapping) for r in related_q.fetchall()]

    lead_dict["customer_score"] = _calc_understanding_score(lead_dict)
    lead_dict["score_label"] = _score_label(lead_dict["customer_score"])

    # WhatsApp contacts & messages linked to this lead
    wa_contacts_row = await db.execute(
        text("""
            SELECT c.id, c.wa_account_id, c.wa_jid, c.phone_number,
                   c.display_name, c.push_name, c.profile_pic_url,
                   c.is_group, c.last_message_at, c.unread_count
            FROM whatsapp_contacts c
            WHERE c.lead_id = :lead_id
            ORDER BY c.last_message_at DESC NULLS LAST
        """),
        {"lead_id": lead_id},
    )
    wa_contacts_list = [dict(r._mapping) for r in wa_contacts_row.fetchall()]
    wa_contact_dict = wa_contacts_list[0] if wa_contacts_list else None
    wa_messages: list = []
    if wa_contacts_list:
        contact_ids = [str(c["id"]) for c in wa_contacts_list]
        # Fetch messages for all linked contacts
        wa_msg_q = await db.execute(
            text("""
                SELECT id, wa_contact_id, direction, message_type, content,
                       media_url, media_mime_type, status, timestamp,
                       reply_to_message_id, is_deleted, is_edited, metadata
                FROM whatsapp_messages
                WHERE wa_contact_id = ANY(:cids) AND is_deleted = FALSE
                ORDER BY timestamp DESC
                LIMIT 200
            """),
            {"cids": contact_ids},
        )
        wa_messages = [dict(r._mapping) for r in wa_msg_q.fetchall()]

    return {
        "lead": lead_dict,
        "interactions": interactions,
        "contracts": contracts,
        "audit_logs": audit_logs,
        "related_leads": related_leads,
        "wa_contact": wa_contact_dict,
        "wa_contacts": wa_contacts_list,
        "wa_messages": wa_messages,
    }


class InteractionCreate(BaseModel):
    type: str
    direction: str = "outbound"
    content: str
    metadata: Optional[dict] = None


@router.post("/leads/{lead_id}/interactions")
async def add_lead_interaction(
    lead_id: str, body: InteractionCreate, ctx: dict = Depends(get_current_user_with_tenant)
):
    db = ctx["db"]
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


class LeadProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    follow_up_status: Optional[str] = None
    assigned_to: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None
    custom_fields: Optional[dict] = None


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
    # Persist summary into ai_summary field
    await db.execute(
        text("UPDATE leads SET ai_summary = :summary WHERE id = :id"),
        {"summary": result.get("summary", ""), "id": lead_id},
    )
    await db.commit()
    return result


_WORKFLOW_STATUS_RANK = ['new', 'inquiry', 'quoted', 'negotiating', 'fulfillment', 'won']

def _get_stage(data: dict, key: str, fallback_idx: str):
    """Return stage data by key (preferred) or legacy index."""
    stages = data.get('stages', {}) or {}
    return stages.get(key) or stages.get(fallback_idx) or {}

def _compute_workflow_status(workflow_data: dict) -> str:
    """Derive the highest CRM lead status earned from workflow completion."""
    s0 = _get_stage(workflow_data, 'sales_negotiation', '0')
    s1 = _get_stage(workflow_data, 'contract_signing', '1')
    s0_done = set(s0.get('completed_steps', []))
    s1_done = set(s1.get('completed_steps', []))

    S0_ALL = {'classify', 'price_inquiry', 'soft_offer', 'firm_offer'}
    S1_ALL = {'confirm_details', 'draft_contract', 'order_note', 'sign_contract', 'send_contract'}
    if S0_ALL.issubset(s0_done) and S1_ALL.issubset(s1_done):
        return 'won'
    if 'sign_contract' in s1_done or 'send_contract' in s1_done:
        return 'fulfillment'
    if 'firm_offer' in s0_done or 'soft_offer' in s0_done:
        return 'negotiating'
    if 'price_inquiry' in s0_done:
        return 'quoted'
    if 'classify' in s0_done:
        return 'inquiry'
    return 'new'


@router.get("/leads/{lead_id}/workflow")
async def get_lead_workflow(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    try:
        row = await db.execute(
            text("SELECT workflow_data, email, company FROM leads WHERE id = :id"),
            {"id": lead_id},
        )
        lead = row.fetchone()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")

        # Detect returning customer: any other won lead with same email or company
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
        # Read current workflow data and status
        cur = await db.execute(
            text("SELECT status, workflow_data, workflow_template_slug FROM leads WHERE id = :id"),
            {"id": lead_id},
        )
        cur_row = cur.fetchone()
        if not cur_row:
            raise HTTPException(status_code=404, detail="Lead not found")
        current_status = cur_row._mapping.get("status") or "new"
        old_workflow_data = cur_row._mapping.get("workflow_data") or {}
        template_slug = cur_row._mapping.get("workflow_template_slug")
        new_status = _compute_workflow_status(body)
        # Only advance, never regress
        cur_rank = _WORKFLOW_STATUS_RANK.index(current_status) if current_status in _WORKFLOW_STATUS_RANK else 0
        new_rank = _WORKFLOW_STATUS_RANK.index(new_status) if new_status in _WORKFLOW_STATUS_RANK else 0
        final_status = new_status if new_rank > cur_rank else current_status

        template_record = await get_effective_template(db, ctx.get("tenant_id"), template_slug)
        template_definition = _normalize_template_definition(template_record.get("definition")) if template_record else {}
        await db.execute(
            text("UPDATE leads SET workflow_data = CAST(:data AS jsonb), status = :status, updated_at = NOW() WHERE id = :id"),
            {"data": json.dumps(body, ensure_ascii=False), "status": final_status, "id": lead_id},
        )

        # Auto-create crm_contract when sign_contract step is completed
        s1 = _get_stage(body, 'contract_signing', '1')
        s0 = _get_stage(body, 'sales_negotiation', '0')
        s1_done = set(s1.get('completed_steps', []))
        if 'sign_contract' in s1_done:
            exists = await db.execute(
                text("SELECT 1 FROM crm_contracts WHERE lead_id = CAST(:lid AS uuid) LIMIT 1"),
                {"lid": lead_id},
            )
            if not exists.fetchone():
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


@router.get("/risks/pending-approvals")
async def pending_approvals(ctx: dict = Depends(get_current_user_with_tenant)):
    rows = await ctx["db"].execute(
        text(
            """
            SELECT ap.*, COALESCE(o.contract_no, '') AS contract_no
            FROM export_flow_approvals ap
            LEFT JOIN export_flow_orders o ON o.id = ap.order_id
            WHERE ap.status = 'pending'
            ORDER BY ap.requested_at DESC
            """
        )
    )
    return [dict(r._mapping) for r in rows.fetchall()]


class ApprovalDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    decision_notes: Optional[str] = None


@router.post("/risks/approvals/{approval_id}/decide")
async def decide_approval(approval_id: str, body: ApprovalDecision, ctx: dict = Depends(get_current_user_with_tenant)):
    if ctx.get("role") not in ("tenant_admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Tenant admin access required")
    result = await ctx["db"].execute(
        text("SELECT id, status FROM export_flow_approvals WHERE id = :id"),
        {"id": approval_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Approval not found")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Approval already decided")
    await ctx["db"].execute(
        text(
            """
            UPDATE export_flow_approvals
            SET status = :status, decision_notes = :decision_notes,
                decided_by = :decided_by, decided_at = :decided_at
            WHERE id = :id
            """
        ),
        {
            "id": approval_id,
            "status": body.decision,
            "decision_notes": body.decision_notes,
            "decided_by": ctx["sub"],
            "decided_at": datetime.utcnow(),
        },
    )
    await ctx["db"].commit()
    return {"status": body.decision}


# ═══════════════════════════════════════════════════════════════════════════════
# 客户中心 (Customer Center) — leads with status=converted or has contracts
# ═══════════════════════════════════════════════════════════════════════════════

def _calc_understanding_score(lead: dict) -> int:
    """
    客户了解度 — calculated from field completeness.
    Returns 0-100 integer score.
    """
    fields = {
        "full_name":     15,
        "email":         12,
        "phone":         10,
        "whatsapp":      10,
        "company":       12,
        "title":         8,
        "country":       8,
        "source":        5,
        "ai_summary":    15,
        "custom_fields": 5,
    }
    score = 0
    for field, weight in fields.items():
        val = lead.get(field)
        if val and val not in (None, "", {}, []):
            score += weight
    return min(score, 100)


def _score_label(score: int) -> str:
    if score >= 80:
        return "深度了解"
    elif score >= 60:
        return "较为了解"
    elif score >= 40:
        return "初步了解"
    else:
        return "了解不足"


@router.get("/customers")
async def list_customers(
    search: str = "",
    skip: int = 0,
    limit: int = 40,
    status: str = "",
    customer_grade: str = "",
    customer_type: str = "",
    assigned_to: str = "",
    source: str = "",
    country: str = "",
    contract_count_min: int = -1,
    contract_count_max: int = -1,
    score_min: int = -1,
    score_max: int = -1,
    sort_by: str = "updated_at",
    sort_dir: str = "desc",
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """
    客户中心 — lists converted leads (status IN ('converted','payment','fulfillment','booking','procuring'))
    or leads that have at least one contract.
    Adds customer_score (understanding score) and score_label to each record.
    Supports multi-condition filtering via comma-separated query params.
    """
    db = ctx["db"]
    where_parts = [
        "(l.status IN ('contact','new','inquiry','replied','qualified','converted','payment','fulfillment','booking','procuring','quoted','negotiating') OR c.contract_count > 0)",
        "l.duplicate_of IS NULL",
        "(l.is_cold IS NULL OR l.is_cold = FALSE)",
    ]
    params: dict = {"skip": skip, "limit": limit}

    if search:
        where_parts.append(
            "(l.full_name ILIKE :search OR l.company ILIKE :search OR l.email ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    # ── Multi-condition filters ──
    if status:
        vals = [v.strip() for v in status.split(",") if v.strip()]
        placeholders = ", ".join(f":st_{i}" for i in range(len(vals)))
        where_parts.append(f"l.status IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"st_{i}"] = v

    if customer_grade:
        vals = [v.strip() for v in customer_grade.split(",") if v.strip()]
        placeholders = ", ".join(f":cg_{i}" for i in range(len(vals)))
        where_parts.append(f"l.custom_fields->>'customer_grade' IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"cg_{i}"] = v

    if customer_type:
        vals = [v.strip() for v in customer_type.split(",") if v.strip()]
        placeholders = ", ".join(f":ct_{i}" for i in range(len(vals)))
        where_parts.append(f"l.custom_fields->>'customer_type' IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"ct_{i}"] = v

    if assigned_to:
        vals = [v.strip() for v in assigned_to.split(",") if v.strip()]
        placeholders = ", ".join(f":at_{i}" for i in range(len(vals)))
        where_parts.append(f"CAST(l.assigned_to AS text) IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"at_{i}"] = v

    if source:
        vals = [v.strip() for v in source.split(",") if v.strip()]
        placeholders = ", ".join(f":src_{i}" for i in range(len(vals)))
        where_parts.append(f"l.source IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"src_{i}"] = v

    if country:
        vals = [v.strip() for v in country.split(",") if v.strip()]
        placeholders = ", ".join(f":co_{i}" for i in range(len(vals)))
        where_parts.append(f"COALESCE(NULLIF(l.country,''), l.custom_fields->>'country', '') IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"co_{i}"] = v

    # contract_count filter — applied via HAVING on the subquery would be complex,
    # so we filter with a subquery condition
    if contract_count_min >= 0:
        where_parts.append("COALESCE(c.contract_count, 0) >= :cc_min")
        params["cc_min"] = contract_count_min
    if contract_count_max >= 0:
        where_parts.append("COALESCE(c.contract_count, 0) <= :cc_max")
        params["cc_max"] = contract_count_max

    where_sql = " AND ".join(where_parts)

    # ── Sorting ──
    _SORT_COLUMNS = {
        "full_name": "l.full_name",
        "company": "l.company",
        "customer_score": None,  # computed after query, sort in Python
        "contract_count": "contract_count",
        "total_contract_value": "total_contract_value",
        "status": "l.status",
        "updated_at": "l.updated_at",
        "created_at": "l.created_at",
        "customer_grade": "l.custom_fields->>'customer_grade'",
        "customer_type": "l.custom_fields->>'customer_type'",
    }
    direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
    sort_col = _SORT_COLUMNS.get(sort_by)
    # For customer_score we need Python-side sort; for others use SQL
    sql_order = f"{sort_col} {direction} NULLS LAST" if sort_col else f"l.updated_at DESC"

    rows = await db.execute(
        text(f"""
            SELECT
                l.id, l.full_name, l.company, l.title, l.email, l.phone, l.whatsapp,
                COALESCE(NULLIF(l.country, ''), l.custom_fields->>'country', '') AS country,
                l.source, l.status, l.ai_summary, l.custom_fields,
                l.assigned_to, l.created_at, l.updated_at,
                l.last_contacted_at, l.duplicate_of, l.is_cold,
                COALESCE(c.contract_count, 0)   AS contract_count,
                COALESCE(c.total_value, 0)       AS total_contract_value,
                COALESCE(c.last_contract_date, NULL) AS last_contract_date,
                u.full_name AS assigned_name
            FROM leads l
            LEFT JOIN (
                SELECT lead_id,
                       COUNT(*)                     AS contract_count,
                       SUM(contract_amount)         AS total_value,
                       MAX(sign_date)               AS last_contract_date
                FROM crm_contracts
                GROUP BY lead_id
            ) c ON c.lead_id = l.id
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE {where_sql}
            ORDER BY {sql_order}
            OFFSET :skip LIMIT :limit
        """),
        params,
    )

    customers = []
    for r in rows.fetchall():
        d = dict(r._mapping)
        d["customer_score"] = _calc_understanding_score(d)
        d["score_label"] = _score_label(d["customer_score"])
        customers.append(d)

    # Python-side score filtering (score is computed in Python, not SQL)
    if score_min >= 0:
        customers = [c for c in customers if c["customer_score"] >= score_min]
    if score_max >= 0:
        customers = [c for c in customers if c["customer_score"] <= score_max]

    # Python-side sort for computed columns
    if sort_by == "customer_score":
        customers.sort(key=lambda x: x.get("customer_score", 0), reverse=(direction == "DESC"))

    # total count
    count_row = await db.execute(
        text(f"""
            SELECT COUNT(*) FROM leads l
            LEFT JOIN (
                SELECT lead_id, COUNT(*) AS contract_count
                FROM crm_contracts GROUP BY lead_id
            ) c ON c.lead_id = l.id
            WHERE {where_sql}
        """),
        params,
    )
    total = count_row.scalar() or 0

    return {"customers": customers, "total": total}


@router.get("/customers/countries")
async def customer_countries(ctx: dict = Depends(get_current_user_with_tenant)):
    """Return country distribution of all active customers [{country, count}]."""
    db = ctx["db"]
    rows = await db.execute(text("""
        SELECT COALESCE(NULLIF(l.country, ''), l.custom_fields->>'country', '') AS country,
               COUNT(*) AS count
        FROM leads l
        LEFT JOIN (
            SELECT lead_id, COUNT(*) AS contract_count
            FROM crm_contracts GROUP BY lead_id
        ) c ON c.lead_id = l.id
        WHERE (l.status IN ('contact','new','inquiry','replied','qualified','converted','payment','fulfillment','booking','procuring','quoted','negotiating')
               OR c.contract_count > 0)
          AND l.duplicate_of IS NULL
          AND (l.is_cold IS NULL OR l.is_cold = FALSE)
        GROUP BY 1
        HAVING COALESCE(NULLIF(l.country, ''), l.custom_fields->>'country', '') != ''
        ORDER BY count DESC
    """))
    return [{"country": r.country, "count": r.count} for r in rows.fetchall()]


@router.get("/customers/{lead_id}")
async def get_customer(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Get single customer detail with understanding score."""
    db = ctx["db"]
    row = await db.execute(
        text("""
            SELECT l.id, l.full_name, l.company, l.title, l.email, l.phone, l.whatsapp,
                   COALESCE(NULLIF(l.country, ''), l.custom_fields->>'country', '') AS country,
                   l.source, l.status, l.ai_summary, l.custom_fields,
                   l.assigned_to, l.created_at, l.updated_at,
                   l.last_contacted_at, l.duplicate_of, l.is_cold,
                   COALESCE(c.contract_count, 0) AS contract_count,
                   COALESCE(c.total_value, 0)    AS total_contract_value,
                   u.full_name AS assigned_name
            FROM leads l
            LEFT JOIN (
                SELECT lead_id, COUNT(*) AS contract_count, SUM(contract_amount) AS total_value
                FROM crm_contracts GROUP BY lead_id
            ) c ON c.lead_id = l.id
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE l.id = CAST(:lid AS uuid)
        """),
        {"lid": lead_id},
    )
    r = row.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Customer not found")
    d = dict(r._mapping)
    d["customer_score"] = _calc_understanding_score(d)
    d["score_label"] = _score_label(d["customer_score"])
    return d


@router.post("/customers/{lead_id}/ai-portrait")
async def generate_ai_portrait(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """
    Generate AI customer portrait (客户画像) for a customer.
    Based on lead profile, interactions, and contracts.
    """
    from app.services.ai.provider import generate_json_for_tenant

    db = ctx["db"]

    # Gather all data
    lead_row = await db.execute(
        text("SELECT * FROM leads WHERE id = CAST(:lid AS uuid)"),
        {"lid": lead_id},
    )
    lead = lead_row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Customer not found")
    lead_d = dict(lead._mapping)

    interactions_row = await db.execute(
        text("SELECT type, direction, content, created_at FROM interactions WHERE lead_id = CAST(:lid AS uuid) ORDER BY created_at DESC LIMIT 20"),
        {"lid": lead_id},
    )
    interactions = [dict(r._mapping) for r in interactions_row.fetchall()]

    # Gather WhatsApp messages linked to this lead
    wa_messages: list[dict] = []
    try:
        wa_msg_row = await db.execute(
            text("""SELECT m.direction, m.content, m.message_type, m.timestamp
                    FROM whatsapp_messages m
                    JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
                    WHERE c.lead_id = CAST(:lid AS uuid) AND m.is_deleted = FALSE
                      AND m.content IS NOT NULL AND m.content != ''
                    ORDER BY m.timestamp DESC LIMIT 30"""),
            {"lid": lead_id},
        )
        wa_messages = [dict(r._mapping) for r in wa_msg_row.fetchall()]
    except Exception:
        pass  # table may not exist in older tenants

    contracts_row = await db.execute(
        text("SELECT contract_no, contract_amount, currency, status, sign_date FROM crm_contracts WHERE lead_id = CAST(:lid AS uuid)"),
        {"lid": lead_id},
    )
    contracts = [dict(r._mapping) for r in contracts_row.fetchall()]

    score = _calc_understanding_score(lead_d)
    cf = lead_d.get("custom_fields") or {}

    # ── Build five-dimension structured input ──
    prompt = f"""请根据以下客户五维结构化信息，生成一份专业的客户画像分析报告（AI客户画像）。

一、【基本联系信息】
姓名: {lead_d.get('full_name', '未知')}
邮箱: {lead_d.get('email', '未知')}
电话: {lead_d.get('phone', '未知')}
WhatsApp: {lead_d.get('whatsapp', '未知')}
性别: {cf.get('gender', '未知')}
职位: {cf.get('position', '') or lead_d.get('title', '未知')}
国家: {lead_d.get('country', '未知')}
城市: {cf.get('city', '未知')}
宗教: {cf.get('religion', '未知')}

二、【公司信息】
公司名称: {lead_d.get('company', '未知')}
行业: {cf.get('industry', '未知')}
公司网站: {cf.get('company_website', '未知')}
主营产品: {cf.get('main_products', '未知')}
公司简介: {cf.get('about_company', '未知')}

三、【业务信息】
客户类型: {cf.get('customer_type', '未知')}
客户质量: {cf.get('customer_quality', '未知')}
客户等级: {cf.get('customer_grade', '未知')}
产品类别: {cf.get('product_category', '未知')}
需求产品: {cf.get('required_products', '未知')}

四、【End Usage】
终端用途: {cf.get('end_usage', '未知')}

五、【商务细节】
下游付款方式: {cf.get('downstream_payment', '未知')}
年采购额: {cf.get('annual_purchase', '未知')}
竞争对手: {cf.get('competitor', '未知')}

【业务员备注】
需求备注: {cf.get('requirements_notes', '暂无')}
攻克策略: {cf.get('attack_notes', '暂无')}
联络备注: {cf.get('contact_notes', '暂无')}

来源: {lead_d.get('source', '未知')}
当前状态: {lead_d.get('status', '未知')}
资料完整度: {score}%

【历史互动记录】({len(interactions)} 条，最近10条)
{chr(10).join([f"- [{i['type']}] {i['content'][:150]}" for i in interactions[:10]]) if interactions else '暂无互动记录'}

【WhatsApp 聊天记录】({len(wa_messages)} 条，最近15条)
{chr(10).join([f"- [{m['direction']}] {m['content'][:200]}" for m in wa_messages[:15]]) if wa_messages else '暂无WhatsApp记录'}

【合同记录】({len(contracts)} 份)
{chr(10).join([f"- {c['contract_no']} {c['contract_amount']} {c['currency']} ({c['status']})" for c in contracts]) if contracts else '暂无合同'}

AI摘要: {lead_d.get('ai_summary', '暂无')}

请输出以下JSON格式的客户画像，所有字段都必须填写。特别注意根据客户的国家和文化背景进行分析：
{{
  "personality_tags": ["标签1", "标签2", "标签3"],
  "buying_intention": "高/中/低",
  "buying_intention_reason": "原因说明",
  "communication_style": "沟通风格描述（如：决策高效、需要大量跟进等）",
  "key_concerns": ["关注点1", "关注点2"],
  "recommended_strategy": "建议的跟进策略（100字以内）",
  "risk_factors": ["风险点1", "风险点2"],
  "opportunity_score": 75,
  "opportunity_reason": "商机评分说明",
  "next_actions": ["下一步行动1", "下一步行动2", "下一步行动3"],
  "customer_type": "潜力客户/核心客户/维护客户/流失风险客户",
  "industry_insight": "行业洞察（客户所在行业的特点和采购规律）",
  "cultural_awareness": "文化与国家特性分析（包括商业习惯、文化禁忌、沟通偏好、重要节假日等）",
  "country_business_customs": "国家商务建议（报价策略、谈判风格、决策链特点、付款偏好等）",
  "customer_needs_summary": "客户核心需求总结（基于五维信息的综合分析，包括产品需求、采购规律、合作潜力）"
}}"""

    try:
        result = await generate_json_for_tenant(
            db=db,
            tenant_id_or_slug=ctx.get("tenant_id"),
            prompt=prompt,
            system_instruction="你是一位资深的B2B国际贸易销售顾问和客户分析专家，擅长从有限信息中洞察客户需求和商机，对全球各国商业文化、贸易习惯有深入了解。请严格按JSON格式输出，不要添加任何解释。",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 生成失败: {e}")

    # Save portrait to lead custom_fields
    existing_cf = lead_d.get("custom_fields") or {}
    existing_cf["_ai_portrait"] = result
    existing_cf["_ai_portrait_at"] = datetime.utcnow().isoformat()

    await db.execute(
        text("UPDATE leads SET custom_fields = :cf, updated_at = NOW() WHERE id = CAST(:lid AS uuid)"),
        {"cf": json.dumps(existing_cf), "lid": lead_id},
    )
    await db.commit()

    return {"success": True, "portrait": result, "customer_score": score}


# ===========================================================================
# Lead File Management
# ===========================================================================

class LeadFileCreate(BaseModel):
    lead_id: str
    file_name: str
    file_url: str
    file_type: Optional[str] = None
    file_size: int = 0
    category: str = "other"
    description: Optional[str] = None
    tags: Optional[list] = None
    involved_user_ids: Optional[list[str]] = None

class LeadFileUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list] = None

class FilePermissionSet(BaseModel):
    permissions: list[dict]  # [{user_id, can_view, can_download}, ...]


def _is_admin(ctx: dict) -> bool:
    role = ctx.get("role", "")
    return role in ("tenant_admin", "platform_admin")

async def _is_admin_scope(ctx: dict) -> bool:
    role = ctx.get("role", "")
    if role in ("tenant_admin", "platform_admin", "manager"):
        return True
    db: AsyncSession = ctx["db"]
    row = await db.execute(
        text("SELECT COALESCE(is_admin, FALSE) AS is_admin FROM users WHERE id = CAST(:uid AS uuid) LIMIT 1"),
        {"uid": ctx["sub"]},
    )
    user = row.fetchone()
    return bool(user and user.is_admin)


@router.post("/lead-files")
async def create_lead_file(body: LeadFileCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db: AsyncSession = ctx["db"]
    user_id = ctx["sub"]

    row = await db.execute(
        text("""
            INSERT INTO lead_files (lead_id, file_name, file_url, file_type, file_size, category, description, tags, uploaded_by)
            VALUES (CAST(:lead_id AS uuid), :file_name, :file_url, :file_type, :file_size, :category, :description, CAST(:tags AS jsonb), CAST(:uid AS uuid))
            RETURNING id
        """),
        {
            "lead_id": body.lead_id, "file_name": body.file_name,
            "file_url": body.file_url, "file_type": body.file_type,
            "file_size": body.file_size, "category": body.category,
            "description": body.description,
            "tags": json.dumps(body.tags or []),
            "uid": user_id,
        },
    )
    file_id = str(row.fetchone()[0])

    # Auto-grant view permission to involved users
    if body.involved_user_ids:
        for uid in body.involved_user_ids:
            await db.execute(
                text("""
                    INSERT INTO lead_file_permissions (file_id, user_id, can_view, can_download, granted_by)
                    VALUES (CAST(:fid AS uuid), CAST(:uid AS uuid), TRUE, FALSE, CAST(:gid AS uuid))
                    ON CONFLICT (file_id, user_id) DO UPDATE SET can_view = TRUE, updated_at = NOW()
                """),
                {"fid": file_id, "uid": uid, "gid": user_id},
            )

    await db.commit()
    return {"id": file_id, "success": True}


@router.get("/lead-files")
async def list_lead_files(
    category: Optional[str] = None,
    lead_id: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db: AsyncSession = ctx["db"]
    user_id = ctx["sub"]
    admin = _is_admin(ctx)

    where = ["1=1"]
    params: dict = {}

    if category:
        where.append("lf.category = :category")
        params["category"] = category
    if lead_id:
        where.append("lf.lead_id = CAST(:lead_id AS uuid)")
        params["lead_id"] = lead_id
    if uploaded_by:
        where.append("lf.uploaded_by = CAST(:uploaded_by AS uuid)")
        params["uploaded_by"] = uploaded_by
    if date_from:
        where.append("lf.created_at >= CAST(:date_from AS date)")
        params["date_from"] = date_from
    if date_to:
        where.append("lf.created_at < CAST(:date_to AS date) + INTERVAL '1 day'")
        params["date_to"] = date_to

    if admin:
        query = f"""
            SELECT lf.*, l.full_name AS lead_name, l.company AS customer_name,
                   u.full_name AS uploader_name
            FROM lead_files lf
            JOIN leads l ON l.id = lf.lead_id
            LEFT JOIN users u ON u.id = lf.uploaded_by
            WHERE {' AND '.join(where)}
            ORDER BY lf.created_at DESC
        """
    else:
        query = f"""
            SELECT lf.*, l.full_name AS lead_name, l.company AS customer_name,
                   u.full_name AS uploader_name, lfp.can_download
            FROM lead_files lf
            JOIN leads l ON l.id = lf.lead_id
            LEFT JOIN users u ON u.id = lf.uploaded_by
            JOIN lead_file_permissions lfp ON lfp.file_id = lf.id
                AND lfp.user_id = CAST(:current_user AS uuid) AND lfp.can_view = TRUE
            WHERE {' AND '.join(where)}
            ORDER BY lf.created_at DESC
        """
        params["current_user"] = user_id

    rows = await db.execute(text(query), params)
    files = []
    for r in rows.fetchall():
        d = dict(r._mapping)
        # Convert UUIDs and dates to strings
        for k in ("id", "lead_id", "uploaded_by"):
            if d.get(k):
                d[k] = str(d[k])
        if d.get("created_at"):
            d["created_at"] = d["created_at"].isoformat()
        # For admin, mark can_download as True
        if admin:
            d["can_download"] = True
        files.append(d)

    # Fetch involved users for each file
    if files:
        file_ids = [f["id"] for f in files]
        placeholders = ", ".join(f"CAST(:fid_{i} AS uuid)" for i in range(len(file_ids)))
        perm_params = {f"fid_{i}": fid for i, fid in enumerate(file_ids)}
        perm_rows = await db.execute(
            text(f"""
                SELECT lfp.file_id, lfp.user_id, lfp.can_view, lfp.can_download,
                       u.full_name, u.email
                FROM lead_file_permissions lfp
                LEFT JOIN users u ON u.id = lfp.user_id
                WHERE lfp.file_id IN ({placeholders})
            """),
            perm_params,
        )
        perm_map: dict = {}
        for pr in perm_rows.fetchall():
            pd = dict(pr._mapping)
            fid = str(pd["file_id"])
            perm_map.setdefault(fid, []).append({
                "user_id": str(pd["user_id"]),
                "full_name": pd.get("full_name") or pd.get("email", ""),
                "can_view": pd["can_view"],
                "can_download": pd["can_download"],
            })
        for f in files:
            f["involved_users"] = perm_map.get(f["id"], [])

    return files


@router.get("/lead-files/{file_id}")
async def get_lead_file(file_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db: AsyncSession = ctx["db"]
    user_id = ctx["sub"]
    admin = _is_admin(ctx)

    row = await db.execute(
        text("""
            SELECT lf.*, l.full_name AS lead_name, l.company AS customer_name,
                   u.full_name AS uploader_name
            FROM lead_files lf
            JOIN leads l ON l.id = lf.lead_id
            LEFT JOIN users u ON u.id = lf.uploaded_by
            WHERE lf.id = CAST(:fid AS uuid)
        """),
        {"fid": file_id},
    )
    r = row.fetchone()
    if not r:
        raise HTTPException(404, "File not found")

    d = dict(r._mapping)
    for k in ("id", "lead_id", "uploaded_by"):
        if d.get(k):
            d[k] = str(d[k])
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()

    # Check access for non-admin
    if not admin:
        perm = await db.execute(
            text("SELECT can_view, can_download FROM lead_file_permissions WHERE file_id = CAST(:fid AS uuid) AND user_id = CAST(:uid AS uuid)"),
            {"fid": file_id, "uid": user_id},
        )
        p = perm.fetchone()
        if not p or not p[0]:
            raise HTTPException(403, "No access")
        d["can_download"] = p[1]
    else:
        d["can_download"] = True

    # Fetch all permissions
    perm_rows = await db.execute(
        text("""
            SELECT lfp.*, u.full_name, u.email
            FROM lead_file_permissions lfp
            LEFT JOIN users u ON u.id = lfp.user_id
            WHERE lfp.file_id = CAST(:fid AS uuid)
        """),
        {"fid": file_id},
    )
    d["permissions"] = []
    for pr in perm_rows.fetchall():
        pd = dict(pr._mapping)
        d["permissions"].append({
            "user_id": str(pd["user_id"]),
            "full_name": pd.get("full_name") or pd.get("email", ""),
            "can_view": pd["can_view"],
            "can_download": pd["can_download"],
        })

    return d


@router.patch("/lead-files/{file_id}")
async def update_lead_file(file_id: str, body: LeadFileUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db: AsyncSession = ctx["db"]
    user_id = ctx["sub"]
    admin = _is_admin(ctx)

    # Check ownership or admin
    if not admin:
        row = await db.execute(
            text("SELECT uploaded_by FROM lead_files WHERE id = CAST(:fid AS uuid)"),
            {"fid": file_id},
        )
        r = row.fetchone()
        if not r or str(r[0]) != user_id:
            raise HTTPException(403, "Only admin or uploader can edit")

    updates = []
    params: dict = {"fid": file_id}
    if body.category is not None:
        updates.append("category = :category")
        params["category"] = body.category
    if body.description is not None:
        updates.append("description = :description")
        params["description"] = body.description
    if body.tags is not None:
        updates.append("tags = CAST(:tags AS jsonb)")
        params["tags"] = json.dumps(body.tags)

    if updates:
        await db.execute(
            text(f"UPDATE lead_files SET {', '.join(updates)} WHERE id = CAST(:fid AS uuid)"),
            params,
        )
        await db.commit()
    return {"success": True}


@router.delete("/lead-files/{file_id}")
async def delete_lead_file(file_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db: AsyncSession = ctx["db"]
    admin = _is_admin(ctx)

    if not admin:
        raise HTTPException(403, "Only admin can delete files")

    await db.execute(
        text("DELETE FROM lead_files WHERE id = CAST(:fid AS uuid)"),
        {"fid": file_id},
    )
    await db.commit()
    return {"success": True}


@router.put("/lead-files/{file_id}/permissions")
async def set_file_permissions(file_id: str, body: FilePermissionSet, ctx: dict = Depends(get_current_user_with_tenant)):
    db: AsyncSession = ctx["db"]
    user_id = ctx["sub"]

    if not _is_admin(ctx):
        raise HTTPException(403, "Admin only")

    for p in body.permissions:
        await db.execute(
            text("""
                INSERT INTO lead_file_permissions (file_id, user_id, can_view, can_download, granted_by)
                VALUES (CAST(:fid AS uuid), CAST(:uid AS uuid), :view, :dl, CAST(:gid AS uuid))
                ON CONFLICT (file_id, user_id) DO UPDATE
                    SET can_view = :view, can_download = :dl, updated_at = NOW()
            """),
            {
                "fid": file_id, "uid": p["user_id"],
                "view": p.get("can_view", True), "dl": p.get("can_download", False),
                "gid": user_id,
            },
        )
    await db.commit()
    return {"success": True}


@router.get("/lead-files/{file_id}/check-access")
async def check_file_access(file_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db: AsyncSession = ctx["db"]
    user_id = ctx["sub"]

    if _is_admin(ctx):
        return {"can_view": True, "can_download": True}

    row = await db.execute(
        text("SELECT can_view, can_download FROM lead_file_permissions WHERE file_id = CAST(:fid AS uuid) AND user_id = CAST(:uid AS uuid)"),
        {"fid": file_id, "uid": user_id},
    )
    r = row.fetchone()
    if not r:
        return {"can_view": False, "can_download": False}
    return {"can_view": r[0], "can_download": r[1]}


# ---------------------------------------------------------------------------
# Unified Communications
# ---------------------------------------------------------------------------

@router.get("/communications")
async def list_communications(
    lead_id: Optional[str] = None,
    account_id: Optional[str] = None,
    channel: Optional[str] = None,
    direction: Optional[str] = None,
    source: Optional[str] = None,
    message_type: Optional[str] = None,
    status: Optional[str] = None,
    user_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "time_desc",
    page: int = 1,
    page_size: int = 50,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Unified message list: interactions + whatsapp_messages."""
    db = ctx["db"]
    current_user_id = ctx["sub"]
    is_admin_scope = await _is_admin_scope(ctx)
    if not is_admin_scope:
        user_id = current_user_id
    offset = (page - 1) * page_size

    # Build WHERE clauses applied to both halves of the UNION
    where_outer: list[str] = []
    params: dict = {"lim": page_size, "off": offset}

    if lead_id:
        where_outer.append("lead_id = :lead_id")
        params["lead_id"] = lead_id
    if account_id:
        where_outer.append("account_id = :account_id")
        params["account_id"] = account_id
    if channel:
        where_outer.append("channel = :channel")
        params["channel"] = channel
    if direction:
        where_outer.append("direction = :direction")
        params["direction"] = direction
    if source:
        where_outer.append("source = :source")
        params["source"] = source
    if message_type:
        where_outer.append("message_type = :message_type")
        params["message_type"] = message_type
    if status:
        where_outer.append("status = :status")
        params["status"] = status
    if search:
        where_outer.append("(content ILIKE :search OR lead_name ILIKE :search OR lead_company ILIKE :search)")
        params["search"] = f"%{search}%"
    if date_from:
        where_outer.append("timestamp >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where_outer.append("timestamp <= :date_to")
        params["date_to"] = date_to
    if user_id:
        where_outer.append("owner_user_id = :owner_user_id")
        params["owner_user_id"] = user_id

    where_sql = (" AND ".join(where_outer)) if where_outer else "TRUE"
    sort_map = {
        "time_desc": "timestamp DESC",
        "time_asc": "timestamp ASC",
        "lead_name_asc": "lead_name ASC NULLS LAST, timestamp DESC",
        "lead_name_desc": "lead_name DESC NULLS LAST, timestamp DESC",
        "channel_asc": "channel ASC, timestamp DESC",
        "channel_desc": "channel DESC, timestamp DESC",
    }
    order = sort_map.get(sort_by, "timestamp DESC")

    union_sql = f"""
        WITH unified AS (
            SELECT
                i.id::text           AS id,
                'interaction'        AS source,
                i.type               AS channel,
                i.direction,
                COALESCE(i.content,'') AS content,
                i.created_at         AS timestamp,
                i.created_by::text   AS owner_user_id,
                u.full_name          AS created_by_name,
                i.lead_id::text,
                COALESCE(i.metadata->>'account_id', '') AS account_id,
                ca.name              AS account_name,
                l.full_name          AS lead_name,
                l.company            AS lead_company,
                NULL                 AS message_type,
                NULL                 AS media_url,
                NULL                 AS status,
                NULL                 AS wa_contact_id,
                CONCAT('interaction:', COALESCE(i.contact_id::text, i.id::text)) AS thread_key,
                COALESCE(l.full_name, ca.name, COALESCE(u.full_name, u.email), i.id::text) AS thread_label
            FROM interactions i
            LEFT JOIN users u ON u.id = i.created_by
            LEFT JOIN leads l ON l.id = i.lead_id
            LEFT JOIN crm_accounts ca ON ca.id = CASE
                WHEN COALESCE(i.metadata->>'account_id', '') ~* '^[0-9a-f-]{36}$'
                THEN CAST(i.metadata->>'account_id' AS uuid)
                ELSE NULL
            END

            UNION ALL

            SELECT
                m.id::text           AS id,
                'whatsapp_message'   AS source,
                'whatsapp'           AS channel,
                m.direction,
                COALESCE(m.content,'') AS content,
                m.timestamp,
                a.owner_user_id::text AS owner_user_id,
                NULL                 AS created_by_name,
                c.lead_id::text,
                c.account_id::text   AS account_id,
                ca.name              AS account_name,
                l.full_name          AS lead_name,
                l.company            AS lead_company,
                m.message_type,
                m.media_url,
                m.status,
                m.wa_contact_id::text,
                CONCAT('wa:', m.wa_contact_id::text) AS thread_key,
                COALESCE(l.full_name, ca.name, c.display_name, c.phone_number, m.wa_contact_id::text) AS thread_label
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
            LEFT JOIN leads l ON l.id = c.lead_id
            LEFT JOIN crm_accounts ca ON ca.id = c.account_id
            WHERE m.is_deleted = FALSE

            UNION ALL

            SELECT
                e.id::text           AS id,
                'email'              AS source,
                'email'              AS channel,
                e.direction,
                COALESCE(e.subject || ': ' || SUBSTRING(e.body_text, 1, 200), '') AS content,
                COALESCE(e.sent_at, e.received_at, e.created_at) AS timestamp,
                COALESCE(e.sender_user_id::text, ues.user_id::text, '') AS owner_user_id,
                eu.full_name         AS created_by_name,
                e.lead_id::text,
                e.account_id::text   AS account_id,
                eca.name             AS account_name,
                el.full_name         AS lead_name,
                el.company           AS lead_company,
                NULL                 AS message_type,
                NULL                 AS media_url,
                e.status,
                NULL                 AS wa_contact_id,
                COALESCE(
                    e.thread_id::text,
                    CONCAT('email:', LEAST(LOWER(COALESCE(e.from_email,'')), LOWER(COALESCE(e.to_email,''))), '|', GREATEST(LOWER(COALESCE(e.from_email,'')), LOWER(COALESCE(e.to_email,''))))
                ) AS thread_key,
                COALESCE(el.full_name, eca.name, NULLIF(e.from_name, ''), e.from_email, e.to_email) AS thread_label
            FROM emails e
            LEFT JOIN users eu ON eu.id = e.sender_user_id
            LEFT JOIN leads el ON el.id = e.lead_id
            LEFT JOIN crm_accounts eca ON eca.id = e.account_id
            LEFT JOIN LATERAL (
                SELECT s.user_id
                FROM user_email_smtp s
                WHERE LOWER(COALESCE(s.smtp_from_email, '')) = LOWER(COALESCE(e.to_email, ''))
                ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
                LIMIT 1
            ) ues ON TRUE
            WHERE e.is_deleted = FALSE
        )
        SELECT * FROM unified
        WHERE {where_sql}
        ORDER BY {order}
        LIMIT :lim OFFSET :off
    """

    count_sql = f"""
        WITH unified AS (
            SELECT i.id, 'interaction' AS source, i.type AS channel, i.direction,
                   COALESCE(i.content,'') AS content, i.created_at AS timestamp,
                   i.created_by::text AS owner_user_id,
                   i.lead_id, COALESCE(i.metadata->>'account_id', '') AS account_id,
                   l.full_name AS lead_name, l.company AS lead_company,
                   NULL::text AS message_type, NULL::text AS status
            FROM interactions i
            LEFT JOIN leads l ON l.id = i.lead_id

            UNION ALL

            SELECT m.id, 'whatsapp_message' AS source, 'whatsapp' AS channel, m.direction,
                   COALESCE(m.content,'') AS content, m.timestamp,
                   a.owner_user_id::text AS owner_user_id,
                   c.lead_id, c.account_id::text AS account_id,
                   l.full_name AS lead_name, l.company AS lead_company,
                   m.message_type, m.status
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
            LEFT JOIN leads l ON l.id = c.lead_id
            WHERE m.is_deleted = FALSE

            UNION ALL

            SELECT e.id, 'email' AS source, 'email' AS channel, e.direction,
                   COALESCE(e.subject || ': ' || SUBSTRING(e.body_text, 1, 200), '') AS content,
                   COALESCE(e.sent_at, e.received_at, e.created_at) AS timestamp,
                   COALESCE(e.sender_user_id::text, ues.user_id::text, '') AS owner_user_id,
                   e.lead_id, e.account_id::text AS account_id,
                   el.full_name AS lead_name, el.company AS lead_company,
                   NULL::text AS message_type, e.status
            FROM emails e
            LEFT JOIN leads el ON el.id = e.lead_id
            LEFT JOIN LATERAL (
                SELECT s.user_id
                FROM user_email_smtp s
                WHERE LOWER(COALESCE(s.smtp_from_email, '')) = LOWER(COALESCE(e.to_email, ''))
                ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
                LIMIT 1
            ) ues ON TRUE
            WHERE e.is_deleted = FALSE
        )
        SELECT COUNT(*) FROM unified WHERE {where_sql}
    """

    rows = await db.execute(text(union_sql), params)
    items = [dict(r._mapping) for r in rows.fetchall()]

    count_params = {k: v for k, v in params.items() if k not in ("lim", "off")}
    total_row = await db.execute(text(count_sql), count_params)
    total = total_row.scalar() or 0

    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# Link Communication to Customer
# ---------------------------------------------------------------------------

class LinkCommBody(BaseModel):
    source: str       # interaction | whatsapp_message | email
    lead_id: Optional[str] = None
    account_id: Optional[str] = None


@router.patch("/communications/{comm_id}/link")
async def link_communication(
    comm_id: str,
    body: LinkCommBody,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Link a communication record (interaction/whatsapp/email) to a lead/account."""
    db = ctx["db"]
    is_admin_scope = await _is_admin_scope(ctx)
    uid = ctx["sub"]

    if body.source == "interaction":
        params: dict = {"cid": comm_id}
        sets: list[str] = []
        if body.lead_id is not None:
            if body.lead_id:
                sets.append("lead_id = CAST(:lid AS uuid)")
                params["lid"] = body.lead_id
            else:
                sets.append("lead_id = NULL")
        if body.account_id is not None:
            if body.account_id:
                sets.append("metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{account_id}', to_jsonb(:aid::text), true)")
                params["aid"] = body.account_id
            else:
                sets.append("metadata = COALESCE(metadata, '{}'::jsonb) - 'account_id'")
        if sets:
            if not is_admin_scope:
                params["uid"] = uid
                where_guard = " AND created_by = CAST(:uid AS uuid)"
            else:
                where_guard = ""
            await db.execute(
                text(f"UPDATE interactions SET {', '.join(sets)} WHERE id = CAST(:cid AS uuid){where_guard}"),
                params,
            )
    elif body.source == "whatsapp_message":
        # Link via the whatsapp_contact, not the message itself
        contact_row = await db.execute(text(
            """
            SELECT m.wa_contact_id
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
            WHERE m.id = CAST(:mid AS uuid)
            """
        ), {"mid": comm_id})
        contact = contact_row.fetchone()
        if contact and contact.wa_contact_id:
            sets: list[str] = []
            params: dict = {"cid": str(contact.wa_contact_id)}
            if body.lead_id is not None:
                if body.lead_id:
                    sets.append("lead_id = CAST(:lid AS uuid)")
                    params["lid"] = body.lead_id
                else:
                    sets.append("lead_id = NULL")
            if body.account_id is not None:
                if body.account_id:
                    sets.append("account_id = CAST(:aid AS uuid)")
                    params["aid"] = body.account_id
                else:
                    sets.append("account_id = NULL")
            if sets:
                if not is_admin_scope:
                    params["uid"] = uid
                    where_guard = """
                        AND EXISTS (
                            SELECT 1 FROM whatsapp_contacts c
                            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
                            WHERE c.id = CAST(:cid AS uuid) AND a.owner_user_id = CAST(:uid AS uuid)
                        )
                    """
                else:
                    where_guard = ""
                await db.execute(
                    text(f"UPDATE whatsapp_contacts SET {', '.join(sets)} WHERE id = CAST(:cid AS uuid){where_guard}"),
                    params,
                )
    elif body.source == "email":
        sets = []
        params: dict = {"cid": comm_id}
        if body.lead_id is not None:
            if body.lead_id:
                sets.append("lead_id = CAST(:lid AS uuid)")
                params["lid"] = body.lead_id
            else:
                sets.append("lead_id = NULL")
        if body.account_id is not None:
            if body.account_id:
                sets.append("account_id = CAST(:aid AS uuid)")
                params["aid"] = body.account_id
            else:
                sets.append("account_id = NULL")
        if sets:
            if not is_admin_scope:
                params["uid"] = uid
                where_guard = """
                    AND (
                        COALESCE(sender_user_id::text, '') = :uid
                        OR EXISTS (
                            SELECT 1 FROM user_email_smtp s
                            WHERE s.user_id = CAST(:uid AS uuid)
                              AND LOWER(COALESCE(s.smtp_from_email, '')) = LOWER(COALESCE(emails.to_email, ''))
                        )
                    )
                """
            else:
                where_guard = ""
            await db.execute(text(
                f"UPDATE emails SET {', '.join(sets)} WHERE id = CAST(:cid AS uuid){where_guard}"
            ), params)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown source: {body.source}")

    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Send Email from CRM
# ---------------------------------------------------------------------------

class SendEmailBody(BaseModel):
    to_email: str
    subject: str
    body: str
    html_body: Optional[str] = None


@router.post("/leads/{lead_id}/send-email")
async def send_lead_email(
    lead_id: str, body: SendEmailBody, ctx: dict = Depends(get_current_user_with_tenant)
):
    db = ctx["db"]

    # Verify lead exists
    lead_row = await db.execute(
        text("SELECT id, full_name, email FROM leads WHERE id = :id"),
        {"id": lead_id},
    )
    lead = lead_row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Send via SMTP
    from app.services.mailer import build_smtp_config, send_email as smtp_send

    config = build_smtp_config()
    ok, result, _mid = await smtp_send(config, body.to_email, body.subject, body.body, body.html_body)
    if not ok:
        raise HTTPException(status_code=502, detail=f"Email send failed: {result}")

    # Record as interaction
    interaction_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO interactions (id, lead_id, type, direction, content, metadata, created_by)
            VALUES (:id, :lead_id, 'email', 'outbound', :content,
                    CAST(:metadata AS jsonb), :created_by)
        """),
        {
            "id": interaction_id,
            "lead_id": lead_id,
            "content": body.body,
            "metadata": json.dumps({
                "subject": body.subject,
                "to_email": body.to_email,
            }),
            "created_by": ctx["sub"],
        },
    )
    await db.execute(
        text("UPDATE leads SET last_contacted_at = NOW() WHERE id = :id"),
        {"id": lead_id},
    )
    await db.commit()

    return {"ok": True, "interaction_id": interaction_id}


# ---------------------------------------------------------------------------
# Customer acquisition: duplicate check by name + acquire + approve
# ---------------------------------------------------------------------------

class NameDupCheck(BaseModel):
    full_name: str


@router.post("/leads/check-name-duplicate")
async def check_name_duplicate(
    body: NameDupCheck,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Lightweight name-based duplicate check returning owner info."""
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


class AcquireCustomerBody(BaseModel):
    customer_lead_id: str


@router.post("/customers/acquire")
async def acquire_customer(
    body: AcquireCustomerBody,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Request to acquire a customer currently owned by another user."""
    db = ctx["db"]
    current_user = ctx["sub"]

    lead_row = await db.execute(
        text("SELECT id, assigned_to, full_name FROM leads WHERE id = :id"),
        {"id": body.customer_lead_id},
    )
    lead = lead_row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Customer not found")

    lead_dict = dict(lead._mapping)
    owner = str(lead_dict.get("assigned_to") or "")
    if owner == str(current_user):
        raise HTTPException(status_code=400, detail="You already own this customer")

    # Check for existing pending request
    existing = await db.execute(
        text("""
            SELECT id FROM customer_acquisition_requests
            WHERE customer_lead_id = :lid AND requested_by = :uid AND status = 'pending'
        """),
        {"lid": body.customer_lead_id, "uid": current_user},
    )
    if existing.fetchone():
        raise HTTPException(status_code=400, detail="You already have a pending request for this customer")

    req_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO customer_acquisition_requests
                (id, customer_lead_id, requested_by, current_owner_id, status)
            VALUES (:id, :lid, :uid, :owner, 'pending')
        """),
        {"id": req_id, "lid": body.customer_lead_id, "uid": current_user, "owner": owner},
    )
    await db.commit()
    return {"id": req_id, "status": "pending"}


@router.get("/customers/acquisition-requests")
async def list_acquisition_requests(
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """List pending acquisition requests visible to current user."""
    db = ctx["db"]
    role = ctx.get("role", "")
    current_user = ctx["sub"]

    if role in ("manager", "tenant_admin", "admin"):
        rows = await db.execute(
            text("""
                SELECT r.*, l.full_name AS customer_name, l.company AS customer_company,
                       req_u.full_name AS requester_name,
                       own_u.full_name AS owner_name
                FROM customer_acquisition_requests r
                JOIN leads l ON l.id = r.customer_lead_id
                LEFT JOIN users req_u ON req_u.id = r.requested_by
                LEFT JOIN users own_u ON own_u.id = r.current_owner_id
                WHERE r.status = 'pending'
                ORDER BY r.created_at DESC
            """)
        )
    else:
        rows = await db.execute(
            text("""
                SELECT r.*, l.full_name AS customer_name, l.company AS customer_company,
                       req_u.full_name AS requester_name,
                       own_u.full_name AS owner_name
                FROM customer_acquisition_requests r
                JOIN leads l ON l.id = r.customer_lead_id
                LEFT JOIN users req_u ON req_u.id = r.requested_by
                LEFT JOIN users own_u ON own_u.id = r.current_owner_id
                WHERE r.status = 'pending' AND r.current_owner_id = :uid
                ORDER BY r.created_at DESC
            """),
            {"uid": current_user},
        )

    return {"requests": [dict(r._mapping) for r in rows.fetchall()]}


class DecideBody(BaseModel):
    decision: Literal["approved", "rejected"]
    notes: Optional[str] = None


@router.post("/customers/acquisition-requests/{request_id}/decide")
async def decide_acquisition(
    request_id: str,
    body: DecideBody,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Approve or reject a customer acquisition request."""
    db = ctx["db"]
    role = ctx.get("role", "")
    current_user = ctx["sub"]

    req_row = await db.execute(
        text("SELECT * FROM customer_acquisition_requests WHERE id = :id AND status = 'pending'"),
        {"id": request_id},
    )
    req = req_row.fetchone()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found or already decided")

    req_dict = dict(req._mapping)

    # Permission: current owner, manager, or tenant_admin
    is_owner = str(req_dict["current_owner_id"]) == str(current_user)
    is_privileged = role in ("manager", "tenant_admin", "admin")
    if not is_owner and not is_privileged:
        raise HTTPException(status_code=403, detail="Not authorized to decide this request")

    await db.execute(
        text("""
            UPDATE customer_acquisition_requests
            SET status = :status, decided_by = :decided_by,
                decided_at = NOW(), decision_notes = :notes
            WHERE id = :id
        """),
        {"status": body.decision, "decided_by": current_user, "notes": body.notes, "id": request_id},
    )

    if body.decision == "approved":
        await db.execute(
            text("UPDATE leads SET assigned_to = :new_owner WHERE id = :lid"),
            {"new_owner": req_dict["requested_by"], "lid": req_dict["customer_lead_id"]},
        )

    await db.commit()
    return {"ok": True, "status": body.decision}
