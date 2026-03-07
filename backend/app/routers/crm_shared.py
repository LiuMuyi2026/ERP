"""
Shared utilities, constants, models, and helpers for the CRM routers.
Extracted from the monolithic crm.py to support crm_customers.py and crm_business.py.
"""

from datetime import date as date_type, datetime, timedelta, timezone
from decimal import Decimal
import json
import logging
import re
import uuid
from typing import Literal, Optional

from fastapi import Body, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

logger = logging.getLogger(__name__)


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

_PAYABLE_UPDATE_FIELDS = {
    "due_date", "amount", "currency", "paid_amount", "status",
    "notes", "invoice_no", "supplier_name", "assigned_to",
    "updated_at",
}


# ---------------------------------------------------------------------------
# Default operation tasks (legacy tuple format used in crm_business)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

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


class ContractLineItemCreate(BaseModel):
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    quantity: float = 0
    unit_price: float = 0
    notes: Optional[str] = None


class InteractionCreate(BaseModel):
    type: str
    direction: str = "outbound"
    content: str
    metadata: Optional[dict] = None


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
    permissions: list[dict]


class SendEmailBody(BaseModel):
    to_email: str
    subject: str
    body: str
    html_body: Optional[str] = None


class LinkCommBody(BaseModel):
    source: str
    lead_id: Optional[str] = None
    account_id: Optional[str] = None


class NameDupCheck(BaseModel):
    full_name: str


class AcquireCustomerBody(BaseModel):
    customer_lead_id: str


class DecideBody(BaseModel):
    decision: Literal["approved", "rejected"]
    notes: Optional[str] = None


class ApprovalDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    decision_notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def _normalize_template_definition(definition: Optional[dict]) -> dict:
    if isinstance(definition, str):
        try:
            return json.loads(definition)
        except json.JSONDecodeError:
            return {}
    if isinstance(definition, dict):
        return definition
    return {}


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


def _calc_understanding_score(lead: dict) -> int:
    fields = {
        "full_name": 15, "email": 12, "phone": 10, "whatsapp": 10,
        "company": 12, "title": 8, "country": 8, "source": 5,
        "ai_summary": 15, "custom_fields": 5,
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


def _is_admin(ctx: dict) -> bool:
    role = ctx.get("role", "")
    return role in ("tenant_admin", "platform_admin")


async def _is_admin_scope(ctx: dict) -> bool:
    role = ctx.get("role", "")
    if role in ("tenant_admin", "platform_admin", "manager"):
        return True
    db = ctx["db"]
    row = await db.execute(
        text("SELECT COALESCE(is_admin, FALSE) AS is_admin FROM users WHERE id = CAST(:uid AS uuid) LIMIT 1"),
        {"uid": ctx["sub"]},
    )
    user = row.fetchone()
    return bool(user and user.is_admin)


def _period_since(period: str):
    now = datetime.utcnow()
    if period == "week":
        return now - timedelta(weeks=13), "week"
    if period == "month":
        return now - timedelta(days=365), "month"
    return now - timedelta(days=30), "day"


def _get_stage(data: dict, key: str, fallback_idx: str):
    """Return stage data by key (preferred) or legacy index."""
    stages = data.get('stages', {}) or {}
    return stages.get(key) or stages.get(fallback_idx) or {}
