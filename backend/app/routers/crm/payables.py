"""
CRM Payables — CRUD and payments.
"""

from datetime import date as date_type
from decimal import Decimal
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant
from app.utils.sql import build_update_clause, parse_date_strict

from app.routers.crm_shared import (
    _PAYABLE_UPDATE_FIELDS,
    PayableCreate, PayableUpdate, PayablePaymentCreate,
)

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Payables
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
