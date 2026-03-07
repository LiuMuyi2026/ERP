"""
CRM Receivables — CRUD and payments.
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
    _RECEIVABLE_UPDATE_FIELDS,
    ReceivableCreate, ReceivableUpdate, PaymentCreate,
)

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Receivables
# ---------------------------------------------------------------------------

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
