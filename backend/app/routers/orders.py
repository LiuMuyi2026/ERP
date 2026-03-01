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
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    specs: Optional[str] = None
    quantity: Optional[str] = None
    quantity_numeric: Optional[float] = None
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
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    specs: Optional[str] = None
    quantity: Optional[str] = None
    quantity_numeric: Optional[float] = None
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
                   s.contact_person AS supplier_contact,
                   p.name AS linked_product_name,
                   p.sku  AS linked_product_sku
            FROM purchase_orders po
            LEFT JOIN suppliers s ON s.id = po.vendor_company_id
            LEFT JOIN products p ON p.id = po.product_id
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
                    expected_date, product_id, product_name, specs, quantity, quantity_numeric, unit_price,
                    payment_method, notes, contract_file_url, contract_file_name,
                    lead_id, created_by, created_at, updated_at
                ) VALUES (
                    :id, :po_number,
                    CASE WHEN :vendor_id = '' OR :vendor_id IS NULL THEN NULL ELSE CAST(:vendor_id AS uuid) END,
                    :status, :total, :currency,
                    :exp_date,
                    CASE WHEN :product_id = '' OR :product_id IS NULL THEN NULL ELSE CAST(:product_id AS uuid) END,
                    :product_name, :specs, :quantity, :quantity_numeric, :unit_price,
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
                "product_id": body.product_id or "",
                "product_name": body.product_name or "",
                "specs": body.specs or "",
                "quantity": body.quantity or "",
                "quantity_numeric": body.quantity_numeric or 0,
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


_PO_UPDATE_FIELDS = {"status", "product_id", "product_name", "specs", "quantity", "quantity_numeric", "unit_price", "total", "currency", "expected_date", "payment_method", "notes", "contract_file_url", "contract_file_name", "vendor_company_id"}


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
        elif k == "product_id":
            set_parts.append("product_id = CASE WHEN :prod_id = '' THEN NULL ELSE CAST(:prod_id AS uuid) END")
            params["prod_id"] = v or ""
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

    # Auto stock inbound + GL posting when PO is fulfilled
    if updates.get("status") == "fulfilled":
        await _fulfill_po_stock(db, po_id, ctx.get("sub", ""))
        await _fulfill_po_gl_posting(db, po_id, ctx.get("sub", ""))

    await db.commit()
    return {"status": "ok"}


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


async def _fulfill_po_stock(db, po_id: str, user_id: str):
    """Auto-create stock inbound when PO is fulfilled."""
    row = await db.execute(
        text("SELECT product_id, quantity_numeric FROM purchase_orders WHERE id = :id"),
        {"id": po_id},
    )
    po = row.fetchone()
    if not po or not po.product_id or not po.quantity_numeric or po.quantity_numeric <= 0:
        return

    # Idempotency check
    dup = await db.execute(
        text("SELECT id FROM stock_movements WHERE reference_type = 'purchase_order' AND reference_id = CAST(:rid AS uuid)"),
        {"rid": po_id},
    )
    if dup.fetchone():
        return

    qty = float(po.quantity_numeric)
    mv_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO stock_movements (id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
            VALUES (:id, :pid, 'purchase_inbound', :qty, 'purchase_order', CAST(:rid AS uuid), 'Auto from PO fulfill',
                    CASE WHEN :uid = '' THEN NULL ELSE CAST(:uid AS uuid) END)
        """),
        {"id": mv_id, "pid": str(po.product_id), "qty": qty, "rid": po_id, "uid": user_id},
    )
    await db.execute(
        text("UPDATE products SET current_stock = current_stock + :qty, updated_at = NOW() WHERE id = :pid"),
        {"qty": qty, "pid": str(po.product_id)},
    )


async def _fulfill_po_gl_posting(db, po_id: str, user_id: str):
    """Auto GL posting: Dr. Inventory, Cr. Accounts Payable when PO is fulfilled."""
    row = await db.execute(
        text("SELECT total, quantity_numeric, unit_price FROM purchase_orders WHERE id = :id"),
        {"id": po_id},
    )
    po = row.fetchone()
    if not po:
        return
    amount = float(po.total or 0)
    if amount <= 0 and po.quantity_numeric and po.unit_price:
        amount = float(po.quantity_numeric) * float(po.unit_price)
    if amount <= 0:
        return

    # Idempotency check
    dup = await db.execute(
        text("SELECT id FROM journal_entries WHERE reference_type = 'purchase_order' AND reference_id = CAST(:rid AS uuid)"),
        {"rid": po_id},
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
                    'purchase_order', CAST(:rid AS uuid),
                    CASE WHEN :uid = '' THEN NULL ELSE CAST(:uid AS uuid) END)"""),
        {"id": entry_id, "num": entry_number, "desc": f"PO fulfilled: {po_id}",
         "amount": amount, "rid": po_id, "uid": user_id},
    )
    # Dr. 1300 Inventory
    await db.execute(
        text("INSERT INTO journal_entry_lines (id, entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (:id, :eid, :aid, '1300', '存货', 'PO inbound', :amt, 0)"),
        {"id": str(uuid.uuid4()), "eid": entry_id, "aid": accounts["1300"], "amt": amount},
    )
    # Cr. 2001 Accounts Payable
    await db.execute(
        text("INSERT INTO journal_entry_lines (id, entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (:id, :eid, :aid, '2001', '应付账款', 'PO inbound', 0, :amt)"),
        {"id": str(uuid.uuid4()), "eid": entry_id, "aid": accounts["2001"], "amt": amount},
    )


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
