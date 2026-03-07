"""
CRM Contracts — CRUD, line items, and cross-module helpers
(GL accounts, inventory deduction, activation GL posting).
"""

from datetime import date as date_type
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant
from app.utils.sql import build_update_clause, parse_date_strict

from app.routers.crm_shared import (
    _CONTRACT_UPDATE_FIELDS,
    DEFAULT_OPERATION_TASKS,
    ContractCreate, ContractUpdate, ContractLineItemCreate,
)

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Contracts CRUD
# ---------------------------------------------------------------------------

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
    rows = await db.execute(
        text("SELECT product_id, quantity FROM contract_line_items WHERE contract_id = CAST(:cid AS uuid) AND product_id IS NOT NULL"),
        {"cid": contract_id},
    )
    items = rows.fetchall()
    if not items:
        return

    for item in items:
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
    await db.execute(
        text("INSERT INTO journal_entry_lines (id, entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (:id, :eid, :aid, '5001', '销售成本', 'Contract COGS', :amt, 0)"),
        {"id": str(uuid.uuid4()), "eid": entry_id, "aid": accounts["5001"], "amt": total_cost},
    )
    await db.execute(
        text("INSERT INTO journal_entry_lines (id, entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (:id, :eid, :aid, '1300', '存货', 'Contract COGS', 0, :amt)"),
        {"id": str(uuid.uuid4()), "eid": entry_id, "aid": accounts["1300"], "amt": total_cost},
    )
