from datetime import date as date_type
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from app.deps import get_current_user_with_tenant
from app.utils.sql import build_update_clause, parse_date_strict
import uuid, json

router = APIRouter(prefix="/orders", tags=["orders"])


class PurchaseOrderCreate(BaseModel):
    po_number: str
    vendor_company_id: Optional[str] = None   # supplier id
    product_name: Optional[str] = None
    specs: Optional[str] = None
    quantity: Optional[str] = None
    unit_price: Optional[Decimal] = None
    total: Optional[Decimal] = None
    currency: str = "USD"
    expected_date: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    contract_file_url: Optional[str] = None
    contract_file_name: Optional[str] = None
    lead_id: Optional[str] = None
    status: str = "draft"


class PurchaseOrderUpdate(BaseModel):
    status: Optional[str] = None
    product_name: Optional[str] = None
    specs: Optional[str] = None
    quantity: Optional[str] = None
    unit_price: Optional[Decimal] = None
    total: Optional[Decimal] = None
    currency: Optional[str] = None
    expected_date: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    contract_file_url: Optional[str] = None
    contract_file_name: Optional[str] = None
    vendor_company_id: Optional[str] = None


# ── Purchase Orders ────────────────────────────────────────────────────────────

@router.get("/purchase")
async def list_purchase_orders(
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    search: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    where_parts = ["1=1"]
    params: dict = {}

    if status:
        where_parts.append("po.status = :status")
        params["status"] = status
    if supplier_id:
        where_parts.append("po.vendor_company_id = CAST(:supplier_id AS uuid)")
        params["supplier_id"] = supplier_id
    if search:
        where_parts.append("(po.po_number ILIKE :s OR po.product_name ILIKE :s OR s.name ILIKE :s)")
        params["s"] = f"%{search}%"

    where = " AND ".join(where_parts)
    result = await db.execute(
        text(f"""
            SELECT po.*,
                   s.name  AS supplier_name,
                   s.rating AS supplier_rating,
                   s.contact_person AS supplier_contact
            FROM purchase_orders po
            LEFT JOIN suppliers s ON s.id = po.vendor_company_id
            WHERE {where}
            ORDER BY po.created_at DESC
        """),
        params,
    )
    rows = [dict(r._mapping) for r in result.fetchall()]
    return rows


@router.post("/purchase")
async def create_purchase_order(
    body: PurchaseOrderCreate,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    po_id = str(uuid.uuid4())
    user_id = ctx.get("sub", "")
    try:
        await db.execute(
            text("""
                INSERT INTO purchase_orders (
                    id, po_number, vendor_company_id, status, total, currency,
                    expected_date, product_name, specs, quantity, unit_price,
                    payment_method, notes, contract_file_url, contract_file_name,
                    lead_id, created_by, created_at, updated_at
                ) VALUES (
                    :id, :po_number,
                    CASE WHEN :vendor_id = '' OR :vendor_id IS NULL THEN NULL ELSE CAST(:vendor_id AS uuid) END,
                    :status, :total, :currency,
                    :exp_date,
                    :product_name, :specs, :quantity, :unit_price,
                    :payment_method, :notes, :contract_file_url, :contract_file_name,
                    CASE WHEN :lead_id = '' OR :lead_id IS NULL THEN NULL ELSE CAST(:lead_id AS uuid) END,
                    CASE WHEN :uid = '' THEN NULL ELSE CAST(:uid AS uuid) END,
                    NOW(), NOW()
                )
            """),
            {
                "id": po_id,
                "po_number": body.po_number,
                "vendor_id": body.vendor_company_id or "",
                "status": body.status,
                "total": body.total or Decimal("0"),
                "currency": body.currency,
                "exp_date": parse_date_strict(body.expected_date, "expected_date"),
                "product_name": body.product_name or "",
                "specs": body.specs or "",
                "quantity": body.quantity or "",
                "unit_price": body.unit_price or Decimal("0"),
                "payment_method": body.payment_method or "",
                "notes": body.notes or "",
                "contract_file_url": body.contract_file_url or "",
                "contract_file_name": body.contract_file_name or "",
                "lead_id": body.lead_id or "",
                "uid": user_id,
            },
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        if "unique" in str(e).lower() or "duplicate key" in str(e).lower():
            raise HTTPException(status_code=409, detail="Purchase order already exists")
        raise HTTPException(status_code=500, detail="Failed to create purchase order")
    return {"id": po_id, "po_number": body.po_number}


@router.get("/purchase/{po_id}")
async def get_purchase_order(po_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(
        text("""
            SELECT po.*,
                   s.name AS supplier_name,
                   s.rating AS supplier_rating,
                   s.contact_person AS supplier_contact,
                   s.contact_info AS supplier_contact_info
            FROM purchase_orders po
            LEFT JOIN suppliers s ON s.id = po.vendor_company_id
            WHERE po.id = :id
        """),
        {"id": po_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return dict(row._mapping)


_PO_UPDATE_FIELDS = {"status", "product_name", "specs", "quantity", "unit_price", "total", "currency", "expected_date", "payment_method", "notes", "contract_file_url", "contract_file_name", "vendor_company_id"}


@router.patch("/purchase/{po_id}")
async def update_purchase_order(
    po_id: str,
    body: PurchaseOrderUpdate,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    updates = {k: v for k, v in updates.items() if k in _PO_UPDATE_FIELDS}
    if not updates:
        return {"status": "no changes"}

    set_parts = []
    params: dict = {"id": po_id}

    for k, v in updates.items():
        if k == "vendor_company_id":
            set_parts.append("vendor_company_id = CASE WHEN :vendor_id = '' THEN NULL ELSE CAST(:vendor_id AS uuid) END")
            params["vendor_id"] = v or ""
        elif k == "expected_date":
            set_parts.append("expected_date = :exp_date")
            params["exp_date"] = parse_date_strict(v, "expected_date")
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v

    set_parts.append("updated_at = NOW()")
    await db.execute(
        text(f"UPDATE purchase_orders SET {', '.join(set_parts)} WHERE id = :id"),
        params,
    )
    await db.commit()
    return {"status": "ok"}


@router.delete("/purchase/{po_id}")
async def delete_purchase_order(po_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(text("DELETE FROM purchase_orders WHERE id = :id"), {"id": po_id})
    await ctx["db"].commit()
    return {"status": "deleted"}


# ── Sales Orders (from crm_contracts) ─────────────────────────────────────────

@router.get("/sales")
async def list_sales_orders(
    status: Optional[str] = None,
    search: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    where_parts = ["1=1"]
    params: dict = {}

    if status:
        where_parts.append("c.status = :status")
        params["status"] = status
    if search:
        where_parts.append("(c.contract_no ILIKE :s OR a.name ILIKE :s)")
        params["s"] = f"%{search}%"

    where = " AND ".join(where_parts)
    result = await db.execute(
        text(f"""
            SELECT c.*,
                   a.name AS account_name,
                   a.country AS account_country
            FROM crm_contracts c
            LEFT JOIN crm_accounts a ON a.id = c.account_id
            WHERE {where}
            ORDER BY c.created_at DESC
        """),
        params,
    )
    return [dict(r._mapping) for r in result.fetchall()]


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def order_stats(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    po_result = await db.execute(text("""
        SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as total_amount
        FROM purchase_orders
        GROUP BY status
    """))
    so_result = await db.execute(text("""
        SELECT status, COUNT(*) as count, COALESCE(SUM(contract_amount), 0) as total_amount
        FROM crm_contracts
        GROUP BY status
    """))
    return {
        "purchase_orders": {r.status: {"count": int(r.count), "amount": float(r.total_amount)} for r in po_result.fetchall()},
        "sales_orders":    {r.status: {"count": int(r.count), "amount": float(r.total_amount)} for r in so_result.fetchall()},
    }
