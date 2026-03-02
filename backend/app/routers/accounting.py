from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from app.deps import get_current_user_with_tenant
from app.utils.sql import parse_date
import uuid
from datetime import date, timedelta

router = APIRouter(prefix="/accounting", tags=["accounting"])


# ── Pydantic models ──────────────────────────────────────────────────────────

class InvoiceLineCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0
    account_id: Optional[str] = None
    tax_rate: float = 0.0


class InvoiceCreate(BaseModel):
    type: str = "receivable"
    contact_id: Optional[str] = None
    company_id: Optional[str] = None
    contact_name: Optional[str] = None
    issue_date: str
    due_date: Optional[str] = None
    currency: str = "USD"
    tax_rate: float = 0.0
    notes: Optional[str] = None
    line_items: List[InvoiceLineCreate] = []


class InvoiceUpdate(BaseModel):
    contact_id: Optional[str] = None
    company_id: Optional[str] = None
    contact_name: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    currency: Optional[str] = None
    tax_rate: Optional[float] = None
    notes: Optional[str] = None
    line_items: Optional[List[InvoiceLineCreate]] = None


class PaymentCreate(BaseModel):
    amount: float
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None
    reference_no: Optional[str] = None
    payment_proof_url: Optional[str] = None
    payment_proof_name: Optional[str] = None
    notes: Optional[str] = None


class AccountCreate(BaseModel):
    code: str
    name: str
    category: Optional[str] = None
    type: Optional[str] = None


class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None


class JournalLineCreate(BaseModel):
    account_id: Optional[str] = None
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    description: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0


class JournalEntryCreate(BaseModel):
    date: str
    description: Optional[str] = None
    lines: List[JournalLineCreate] = []


class ExpenseItemCreate(BaseModel):
    expense_date: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    amount: float = 0.0
    currency: str = "USD"
    receipt_url: Optional[str] = None
    receipt_name: Optional[str] = None
    account_id: Optional[str] = None


class ExpenseReportCreate(BaseModel):
    employee_name: Optional[str] = None
    submit_date: Optional[str] = None
    currency: str = "USD"
    category: Optional[str] = None
    notes: Optional[str] = None
    items: List[ExpenseItemCreate] = []


class ExpenseReportUpdate(BaseModel):
    employee_name: Optional[str] = None
    submit_date: Optional[str] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[ExpenseItemCreate]] = None


# ── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def get_dashboard(period: str = "month", ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    today = date.today()
    if period == "quarter":
        month_start = today.replace(month=((today.month - 1) // 3) * 3 + 1, day=1)
    elif period == "year":
        month_start = today.replace(month=1, day=1)
    else:
        month_start = today.replace(day=1)

    # KPI: all metrics in a single query
    r = await db.execute(text("""
        SELECT
            (SELECT COALESCE(SUM(total - COALESCE(paid_amount, 0)), 0) FROM invoices WHERE type='receivable' AND status NOT IN ('paid','cancelled')),
            (SELECT COALESCE(SUM(total - COALESCE(paid_amount, 0)), 0) FROM invoices WHERE type='receivable' AND status NOT IN ('paid','cancelled') AND due_date < :today),
            (SELECT COALESCE(SUM(total - COALESCE(paid_amount, 0)), 0) FROM invoices WHERE type='payable' AND status NOT IN ('paid','cancelled')),
            (SELECT COALESCE(SUM(p.amount), 0) FROM invoice_payments p JOIN invoices i ON p.invoice_id = i.id WHERE i.type='receivable' AND p.payment_date >= :start),
            (SELECT COALESCE(SUM(p.amount), 0) FROM invoice_payments p JOIN invoices i ON p.invoice_id = i.id WHERE i.type='payable' AND p.payment_date >= :start),
            (SELECT COALESCE(SUM(total_amount), 0) FROM expense_reports WHERE status='paid' AND paid_date >= :start)
    """), {"today": today, "start": month_start})
    kpi = r.fetchone()
    total_receivable = float(kpi[0] or 0)
    overdue_receivable = float(kpi[1] or 0)
    total_payable = float(kpi[2] or 0)
    monthly_income = float(kpi[3] or 0)
    monthly_expense = float(kpi[4] or 0) + float(kpi[5] or 0)
    net_profit = monthly_income - monthly_expense

    # Receivable/Payable trend (last 6 months) — single query
    months = []
    for i in range(5, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        months.append(date(y, m, 1))
    trend_start = months[0]
    last = months[-1]
    trend_end = date(last.year + 1, 1, 1) if last.month == 12 else date(last.year, last.month + 1, 1)
    r = await db.execute(text(
        "SELECT to_char(issue_date, 'YYYY-MM') AS month, type, COALESCE(SUM(total), 0) AS total "
        "FROM invoices WHERE issue_date >= :s AND issue_date < :e AND type IN ('receivable','payable') "
        "GROUP BY month, type"
    ), {"s": trend_start, "e": trend_end})
    trend_map: dict = {}
    for row in r.fetchall():
        key = row[0]
        if key not in trend_map:
            trend_map[key] = {"month": key, "receivable": 0, "payable": 0}
        trend_map[key][row[1]] = float(row[2] or 0)
    trend = [trend_map.get(m.strftime("%Y-%m"), {"month": m.strftime("%Y-%m"), "receivable": 0, "payable": 0}) for m in months]

    # Collection progress (donut)
    r = await db.execute(text("SELECT COALESCE(SUM(total), 0), COALESCE(SUM(COALESCE(paid_amount, 0)), 0) FROM invoices WHERE type='receivable' AND status NOT IN ('cancelled')"))
    row = r.fetchone()
    collection_total = float(row[0] or 0)
    collection_paid = float(row[1] or 0)

    # Aging buckets
    aging = {"current": 0, "days_30": 0, "days_60": 0, "days_90": 0, "over_90": 0}
    r = await db.execute(text("SELECT due_date, (total - COALESCE(paid_amount, 0)) as outstanding FROM invoices WHERE type='receivable' AND status NOT IN ('paid','cancelled') AND due_date IS NOT NULL"))
    for row in r.fetchall():
        dd = row[0]
        amt = float(row[1] or 0)
        if dd is None:
            aging["current"] += amt
        else:
            days = (today - dd).days
            if days <= 0:
                aging["current"] += amt
            elif days <= 30:
                aging["days_30"] += amt
            elif days <= 60:
                aging["days_60"] += amt
            elif days <= 90:
                aging["days_90"] += amt
            else:
                aging["over_90"] += amt

    # Upcoming due (top 10)
    r = await db.execute(text("SELECT id, invoice_number, contact_name, type, due_date, total, COALESCE(paid_amount, 0) as paid_amount, status FROM invoices WHERE status NOT IN ('paid','cancelled') AND due_date IS NOT NULL ORDER BY due_date ASC LIMIT 10"))
    upcoming = [dict(row._mapping) for row in r.fetchall()]

    # Recent transactions (last 10 payments)
    r = await db.execute(text("SELECT p.id, p.amount, p.payment_date, p.payment_method, p.notes, i.invoice_number, i.type FROM invoice_payments p JOIN invoices i ON p.invoice_id = i.id ORDER BY p.created_at DESC LIMIT 10"))
    recent_transactions = [dict(row._mapping) for row in r.fetchall()]

    return {
        "kpi": {
            "total_receivable": total_receivable,
            "overdue_receivable": overdue_receivable,
            "total_payable": total_payable,
            "monthly_income": monthly_income,
            "monthly_expense": monthly_expense,
            "net_profit": net_profit,
        },
        "trend": trend,
        "collection": {"total": collection_total, "paid": collection_paid},
        "aging": aging,
        "upcoming": upcoming,
        "recent_transactions": recent_transactions,
    }


# ── Invoices ─────────────────────────────────────────────────────────────────

@router.get("/invoices")
async def list_invoices(type: Optional[str] = None, status: Optional[str] = None, limit: int = 50, offset: int = 0, ctx: dict = Depends(get_current_user_with_tenant)):
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    conditions = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}
    if type:
        conditions.append("type = :type")
        params["type"] = type
    if status:
        conditions.append("status = :status")
        params["status"] = status
    where = " AND ".join(conditions)
    result = await ctx["db"].execute(text(f"SELECT * FROM invoices WHERE {where} ORDER BY created_at DESC LIMIT :limit OFFSET :offset"), params)
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/invoices")
async def create_invoice(body: InvoiceCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    subtotal = sum(item.quantity * item.unit_price for item in body.line_items)
    tax_amount = subtotal * (body.tax_rate / 100)
    total = subtotal + tax_amount
    result = await db.execute(text("SELECT COUNT(*) FROM invoices"))
    count = result.scalar()
    inv_number = f"INV-{(count + 1):05d}"
    inv_id = str(uuid.uuid4())
    await db.execute(text("SAVEPOINT sp_create_invoice"))
    try:
        await db.execute(
            text("INSERT INTO invoices (id, invoice_number, type, contact_id, company_id, contact_name, issue_date, due_date, currency, tax_rate, tax_amount, subtotal, total, notes, created_by) VALUES (:id, :num, :type, :contact, :company, :contact_name, :issue, :due, :currency, :tax_rate, :tax_amount, :subtotal, :total, :notes, :creator)"),
            {"id": inv_id, "num": inv_number, "type": body.type, "contact": body.contact_id,
             "company": body.company_id, "contact_name": body.contact_name,
             "issue": parse_date(body.issue_date), "due": parse_date(body.due_date),
             "currency": body.currency, "tax_rate": body.tax_rate, "tax_amount": tax_amount,
             "subtotal": subtotal, "total": total, "notes": body.notes, "creator": ctx["sub"]}
        )
        for item in body.line_items:
            item_id = str(uuid.uuid4())
            await db.execute(
                text("INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount, account_id, tax_rate) VALUES (:id, :inv_id, :desc, :qty, :price, :amount, :account, :tax)"),
                {"id": item_id, "inv_id": inv_id, "desc": item.description, "qty": item.quantity,
                 "price": item.unit_price, "amount": item.quantity * item.unit_price, "account": item.account_id, "tax": item.tax_rate}
            )
        await db.commit()
    except Exception:
        await db.execute(text("ROLLBACK TO SAVEPOINT sp_create_invoice"))
        raise
    return {"id": inv_id, "invoice_number": inv_number, "total": total}


@router.get("/invoices/{inv_id}")
async def get_invoice(inv_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(text("SELECT * FROM invoices WHERE id = :id"), {"id": inv_id})
    inv = result.fetchone()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    lines = await db.execute(text("SELECT * FROM invoice_line_items WHERE invoice_id = :id ORDER BY created_at"), {"id": inv_id})
    payments = await db.execute(text("SELECT * FROM invoice_payments WHERE invoice_id = :id ORDER BY payment_date DESC"), {"id": inv_id})
    return {**dict(inv._mapping), "line_items": [dict(l._mapping) for l in lines.fetchall()], "payments": [dict(p._mapping) for p in payments.fetchall()]}


@router.put("/invoices/{inv_id}")
async def update_invoice(inv_id: str, body: InvoiceUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(text("SELECT * FROM invoices WHERE id = :id"), {"id": inv_id})
    inv = result.fetchone()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv._mapping["status"] not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft invoices can be edited")

    sets = ["updated_at = NOW()"]
    params: dict = {"id": inv_id}
    for field in ["contact_id", "company_id", "contact_name", "currency", "notes"]:
        val = getattr(body, field, None)
        if val is not None:
            sets.append(f"{field} = :{field}")
            params[field] = val
    if body.issue_date:
        sets.append("issue_date = :issue_date")
        params["issue_date"] = parse_date(body.issue_date)
    if body.due_date:
        sets.append("due_date = :due_date")
        params["due_date"] = parse_date(body.due_date)
    if body.tax_rate is not None:
        sets.append("tax_rate = :tax_rate")
        params["tax_rate"] = body.tax_rate

    if body.line_items is not None:
        await db.execute(text("DELETE FROM invoice_line_items WHERE invoice_id = :id"), {"id": inv_id})
        subtotal = sum(item.quantity * item.unit_price for item in body.line_items)
        tax_rate = body.tax_rate if body.tax_rate is not None else float(inv._mapping.get("tax_rate", 0))
        tax_amount = subtotal * (tax_rate / 100)
        total = subtotal + tax_amount
        sets.extend(["subtotal = :subtotal", "tax_amount = :tax_amount", "total = :total"])
        params.update({"subtotal": subtotal, "tax_amount": tax_amount, "total": total})
        for item in body.line_items:
            item_id = str(uuid.uuid4())
            await db.execute(
                text("INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount, account_id, tax_rate) VALUES (:id, :inv_id, :desc, :qty, :price, :amount, :account, :tax)"),
                {"id": item_id, "inv_id": inv_id, "desc": item.description, "qty": item.quantity,
                 "price": item.unit_price, "amount": item.quantity * item.unit_price, "account": item.account_id, "tax": item.tax_rate}
            )

    await db.execute(text(f"UPDATE invoices SET {', '.join(sets)} WHERE id = :id"), params)
    await db.commit()
    return {"ok": True}


@router.delete("/invoices/{inv_id}")
async def delete_invoice(inv_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(text("SELECT status FROM invoices WHERE id = :id"), {"id": inv_id})
    inv = result.fetchone()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv._mapping["status"] not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft invoices can be deleted")
    await db.execute(text("DELETE FROM invoice_line_items WHERE invoice_id = :id"), {"id": inv_id})
    await db.execute(text("DELETE FROM invoice_payments WHERE invoice_id = :id"), {"id": inv_id})
    await db.execute(text("DELETE FROM invoices WHERE id = :id"), {"id": inv_id})
    await db.commit()
    return {"ok": True}


@router.patch("/invoices/{inv_id}/status")
async def update_invoice_status(inv_id: str, status: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(text("UPDATE invoices SET status = :status, updated_at = NOW() WHERE id = :id"), {"status": status, "id": inv_id})
    await ctx["db"].commit()
    return {"status": status}


# ── Invoice payments ─────────────────────────────────────────────────────────

@router.get("/invoices/{inv_id}/payments")
async def list_invoice_payments(inv_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(text("SELECT * FROM invoice_payments WHERE invoice_id = :id ORDER BY payment_date DESC"), {"id": inv_id})
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/invoices/{inv_id}/payments")
async def create_invoice_payment(inv_id: str, body: PaymentCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(text("SELECT total, COALESCE(paid_amount, 0) as paid_amount, status FROM invoices WHERE id = :id"), {"id": inv_id})
    inv = result.fetchone()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv_map = inv._mapping
    total = float(inv_map["total"] or 0)
    current_paid = float(inv_map["paid_amount"] or 0)
    new_paid = current_paid + body.amount

    pay_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO invoice_payments (id, invoice_id, amount, payment_date, payment_method, reference_no, payment_proof_url, payment_proof_name, notes, created_by) VALUES (:id, :inv_id, :amount, :date, :method, :ref, :proof_url, :proof_name, :notes, :creator)"),
        {"id": pay_id, "inv_id": inv_id, "amount": body.amount,
         "date": parse_date(body.payment_date) if body.payment_date else date.today(),
         "method": body.payment_method, "ref": body.reference_no,
         "proof_url": body.payment_proof_url, "proof_name": body.payment_proof_name,
         "notes": body.notes, "creator": ctx["sub"]}
    )

    new_status = "paid" if new_paid >= total else "partial"
    await db.execute(text("UPDATE invoices SET paid_amount = :paid, status = :status, updated_at = NOW() WHERE id = :id"),
                     {"paid": new_paid, "status": new_status, "id": inv_id})
    await db.commit()
    return {"id": pay_id, "new_paid_amount": new_paid, "new_status": new_status}


# ── Chart of Accounts ────────────────────────────────────────────────────────

@router.get("/accounts")
async def list_accounts(include_inactive: bool = False, ctx: dict = Depends(get_current_user_with_tenant)):
    condition = "1=1" if include_inactive else "is_active = TRUE"
    result = await ctx["db"].execute(text(f"SELECT * FROM chart_of_accounts WHERE {condition} ORDER BY code"))
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/accounts")
async def create_account(body: AccountCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    acc_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO chart_of_accounts (id, code, name, category, type) VALUES (:id, :code, :name, :category, :type)"),
        {"id": acc_id, "code": body.code, "name": body.name, "category": body.category, "type": body.type}
    )
    await db.commit()
    return {"id": acc_id, "code": body.code, "name": body.name}


@router.put("/accounts/{acc_id}")
async def update_account(acc_id: str, body: AccountUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    sets = []
    params: dict = {"id": acc_id}
    for field in ["code", "name", "category", "type"]:
        val = getattr(body, field, None)
        if val is not None:
            sets.append(f"{field} = :{field}")
            params[field] = val
    if not sets:
        return {"ok": True}
    await db.execute(text(f"UPDATE chart_of_accounts SET {', '.join(sets)} WHERE id = :id"), params)
    await db.commit()
    return {"ok": True}


@router.patch("/accounts/{acc_id}/toggle")
async def toggle_account(acc_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await db.execute(text("UPDATE chart_of_accounts SET is_active = NOT is_active WHERE id = :id"), {"id": acc_id})
    await db.commit()
    r = await db.execute(text("SELECT is_active FROM chart_of_accounts WHERE id = :id"), {"id": acc_id})
    row = r.fetchone()
    return {"is_active": row._mapping["is_active"] if row else None}


@router.post("/accounts/seed")
async def seed_accounts(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    seeds = [
        ("1001", "Cash", "asset", "current_asset"),
        ("1002", "Bank Deposit", "asset", "current_asset"),
        ("1100", "Accounts Receivable", "asset", "current_asset"),
        ("1200", "Prepaid Expenses", "asset", "current_asset"),
        ("1500", "Fixed Assets", "asset", "fixed_asset"),
        ("2001", "Accounts Payable", "liability", "current_liability"),
        ("2100", "Accrued Liabilities", "liability", "current_liability"),
        ("2200", "Tax Payable", "liability", "current_liability"),
        ("3001", "Owner Equity", "equity", "equity"),
        ("3002", "Retained Earnings", "equity", "equity"),
        ("4001", "Sales Revenue", "revenue", "operating_revenue"),
        ("4002", "Service Revenue", "revenue", "operating_revenue"),
        ("4100", "Other Income", "revenue", "other_revenue"),
        ("5001", "Cost of Goods Sold", "expense", "cost"),
        ("5002", "Purchase Cost", "expense", "cost"),
        ("5100", "Freight & Shipping", "expense", "operating_expense"),
        ("5200", "Customs & Duties", "expense", "operating_expense"),
        ("5300", "Insurance", "expense", "operating_expense"),
        ("5400", "Commission", "expense", "operating_expense"),
        ("6001", "Salary & Wages", "expense", "operating_expense"),
        ("6002", "Rent", "expense", "operating_expense"),
        ("6003", "Office Supplies", "expense", "operating_expense"),
        ("6004", "Travel & Entertainment", "expense", "operating_expense"),
        ("6005", "Communication", "expense", "operating_expense"),
        ("6100", "Bank Charges", "expense", "financial_expense"),
        ("6200", "Exchange Loss", "expense", "financial_expense"),
        ("6300", "Exchange Gain", "revenue", "financial_revenue"),
    ]
    created = 0
    for code, name, category, acc_type in seeds:
        r = await db.execute(text("SELECT id FROM chart_of_accounts WHERE code = :code"), {"code": code})
        if not r.fetchone():
            await db.execute(
                text("INSERT INTO chart_of_accounts (id, code, name, category, type) VALUES (:id, :code, :name, :category, :type)"),
                {"id": str(uuid.uuid4()), "code": code, "name": name, "category": category, "type": acc_type}
            )
            created += 1
    await db.commit()
    return {"created": created, "total": len(seeds)}


# ── Journal entries ──────────────────────────────────────────────────────────

@router.get("/journal-entries")
async def list_journal_entries(status: Optional[str] = None, limit: int = 50, offset: int = 0, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)

    # Ensure journal_entries table exists (auto-created by tenant migration)
    await db.execute(text("""CREATE TABLE IF NOT EXISTS journal_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_number VARCHAR(50) UNIQUE,
        date DATE NOT NULL,
        description TEXT,
        status VARCHAR(30) DEFAULT 'draft',
        total_debit NUMERIC(19,4) DEFAULT 0.0,
        total_credit NUMERIC(19,4) DEFAULT 0.0,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )"""))
    await db.execute(text("""CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_id UUID NOT NULL,
        account_id UUID,
        account_code VARCHAR(30),
        account_name VARCHAR(255),
        description VARCHAR(500),
        debit NUMERIC(19,4) DEFAULT 0.0,
        credit NUMERIC(19,4) DEFAULT 0.0
    )"""))
    await db.commit()

    conditions = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}
    if status:
        conditions.append("status = :status")
        params["status"] = status
    where = " AND ".join(conditions)

    result = await db.execute(text(f"SELECT * FROM journal_entries WHERE {where} ORDER BY date DESC, created_at DESC LIMIT :limit OFFSET :offset"), params)
    entries = [dict(row._mapping) for row in result.fetchall()]
    if entries:
        entry_ids = [e["id"] for e in entries]
        lines_result = await db.execute(
            text("SELECT * FROM journal_entry_lines WHERE entry_id = ANY(:ids)"),
            {"ids": entry_ids}
        )
        lines_by_entry: dict = {}
        for l in lines_result.fetchall():
            ld = dict(l._mapping)
            lines_by_entry.setdefault(str(ld["entry_id"]), []).append(ld)
        for e in entries:
            e["lines"] = lines_by_entry.get(str(e["id"]), [])
    return entries


@router.post("/journal-entries")
async def create_journal_entry(body: JournalEntryCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]

    # Ensure tables exist
    await db.execute(text("""CREATE TABLE IF NOT EXISTS journal_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entry_number VARCHAR(50) UNIQUE, date DATE NOT NULL,
        description TEXT, status VARCHAR(30) DEFAULT 'draft', total_debit NUMERIC(19,4) DEFAULT 0.0,
        total_credit NUMERIC(19,4) DEFAULT 0.0, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW()
    )"""))
    await db.execute(text("""CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), entry_id UUID NOT NULL, account_id UUID,
        account_code VARCHAR(30), account_name VARCHAR(255), description VARCHAR(500),
        debit NUMERIC(19,4) DEFAULT 0.0, credit NUMERIC(19,4) DEFAULT 0.0
    )"""))
    await db.commit()

    total_debit = sum(l.debit for l in body.lines)
    total_credit = sum(l.credit for l in body.lines)
    if abs(total_debit - total_credit) > 0.01:
        raise HTTPException(status_code=400, detail=f"Debit ({total_debit}) must equal Credit ({total_credit})")

    r = await db.execute(text("SELECT COUNT(*) FROM journal_entries"))
    count = r.scalar()
    entry_number = f"JE-{(count + 1):05d}"
    entry_id = str(uuid.uuid4())

    await db.execute(
        text("INSERT INTO journal_entries (id, entry_number, date, description, total_debit, total_credit, created_by) VALUES (:id, :num, :date, :desc, :debit, :credit, :creator)"),
        {"id": entry_id, "num": entry_number, "date": parse_date(body.date), "desc": body.description,
         "debit": total_debit, "credit": total_credit, "creator": ctx["sub"]}
    )
    for line in body.lines:
        line_id = str(uuid.uuid4())
        await db.execute(
            text("INSERT INTO journal_entry_lines (id, entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (:id, :eid, :aid, :code, :name, :desc, :debit, :credit)"),
            {"id": line_id, "eid": entry_id, "aid": line.account_id, "code": line.account_code,
             "name": line.account_name, "desc": line.description, "debit": line.debit, "credit": line.credit}
        )
    await db.commit()
    return {"id": entry_id, "entry_number": entry_number, "total_debit": total_debit, "total_credit": total_credit}


@router.get("/journal-entries/{entry_id}")
async def get_journal_entry(entry_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(text("SELECT * FROM journal_entries WHERE id = :id"), {"id": entry_id})
    entry = result.fetchone()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    lines = await db.execute(text("SELECT * FROM journal_entry_lines WHERE entry_id = :id"), {"id": entry_id})
    return {**dict(entry._mapping), "lines": [dict(l._mapping) for l in lines.fetchall()]}


@router.patch("/journal-entries/{entry_id}/status")
async def update_journal_entry_status(entry_id: str, status: str = Query(...), ctx: dict = Depends(get_current_user_with_tenant)):
    if status not in ("posted", "voided"):
        raise HTTPException(status_code=400, detail="Status must be 'posted' or 'voided'")
    db = ctx["db"]
    await db.execute(text("UPDATE journal_entries SET status = :status WHERE id = :id"), {"status": status, "id": entry_id})
    await db.commit()
    return {"status": status}


# ── Expense Reports ──────────────────────────────────────────────────────────

@router.get("/expense-reports")
async def list_expense_reports(status: Optional[str] = None, limit: int = 50, offset: int = 0, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    limit = min(max(limit, 1), 200)
    conditions = ["1=1"]
    params: dict = {"limit": limit, "offset": max(offset, 0)}
    if status:
        conditions.append("status = :status")
        params["status"] = status
    where = " AND ".join(conditions)
    result = await db.execute(text(f"SELECT * FROM expense_reports WHERE {where} ORDER BY created_at DESC LIMIT :limit OFFSET :offset"), params)
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/expense-reports")
async def create_expense_report(body: ExpenseReportCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    total = sum(item.amount for item in body.items)
    r = await db.execute(text("SELECT COUNT(*) FROM expense_reports"))
    count = r.scalar()
    report_number = f"EXP-{(count + 1):05d}"
    report_id = str(uuid.uuid4())

    await db.execute(
        text("INSERT INTO expense_reports (id, report_number, employee_name, submit_date, total_amount, currency, category, notes, created_by) VALUES (:id, :num, :employee, :date, :total, :currency, :category, :notes, :creator)"),
        {"id": report_id, "num": report_number, "employee": body.employee_name,
         "date": parse_date(body.submit_date) if body.submit_date else date.today(),
         "total": total, "currency": body.currency, "category": body.category,
         "notes": body.notes, "creator": ctx["sub"]}
    )
    for item in body.items:
        item_id = str(uuid.uuid4())
        await db.execute(
            text("INSERT INTO expense_items (id, report_id, expense_date, category, description, amount, currency, receipt_url, receipt_name, account_id) VALUES (:id, :rid, :date, :cat, :desc, :amount, :currency, :url, :name, :aid)"),
            {"id": item_id, "rid": report_id, "date": parse_date(item.expense_date) if item.expense_date else None,
             "cat": item.category, "desc": item.description, "amount": item.amount, "currency": item.currency,
             "url": item.receipt_url, "name": item.receipt_name, "aid": item.account_id}
        )
    await db.commit()
    return {"id": report_id, "report_number": report_number, "total_amount": total}


@router.get("/expense-reports/{report_id}")
async def get_expense_report(report_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(text("SELECT * FROM expense_reports WHERE id = :id"), {"id": report_id})
    report = result.fetchone()
    if not report:
        raise HTTPException(status_code=404, detail="Expense report not found")
    items = await db.execute(text("SELECT * FROM expense_items WHERE report_id = :id"), {"id": report_id})
    return {**dict(report._mapping), "items": [dict(i._mapping) for i in items.fetchall()]}


@router.put("/expense-reports/{report_id}")
async def update_expense_report(report_id: str, body: ExpenseReportUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(text("SELECT status FROM expense_reports WHERE id = :id"), {"id": report_id})
    report = result.fetchone()
    if not report:
        raise HTTPException(status_code=404, detail="Expense report not found")
    if report._mapping["status"] not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft reports can be edited")

    sets = ["updated_at = NOW()"]
    params: dict = {"id": report_id}
    for field in ["employee_name", "currency", "category", "notes"]:
        val = getattr(body, field, None)
        if val is not None:
            sets.append(f"{field} = :{field}")
            params[field] = val
    if body.submit_date:
        sets.append("submit_date = :submit_date")
        params["submit_date"] = parse_date(body.submit_date)

    if body.items is not None:
        await db.execute(text("DELETE FROM expense_items WHERE report_id = :id"), {"id": report_id})
        total = sum(item.amount for item in body.items)
        sets.append("total_amount = :total_amount")
        params["total_amount"] = total
        for item in body.items:
            item_id = str(uuid.uuid4())
            await db.execute(
                text("INSERT INTO expense_items (id, report_id, expense_date, category, description, amount, currency, receipt_url, receipt_name, account_id) VALUES (:id, :rid, :date, :cat, :desc, :amount, :currency, :url, :name, :aid)"),
                {"id": item_id, "rid": report_id, "date": parse_date(item.expense_date) if item.expense_date else None,
                 "cat": item.category, "desc": item.description, "amount": item.amount, "currency": item.currency,
                 "url": item.receipt_url, "name": item.receipt_name, "aid": item.account_id}
            )

    await db.execute(text(f"UPDATE expense_reports SET {', '.join(sets)} WHERE id = :id"), params)
    await db.commit()
    return {"ok": True}


@router.patch("/expense-reports/{report_id}/status")
async def update_expense_report_status(report_id: str, status: str = Query(...), rejection_reason: Optional[str] = Query(None), ctx: dict = Depends(get_current_user_with_tenant)):
    if status not in ("pending", "approved", "rejected", "paid"):
        raise HTTPException(status_code=400, detail="Invalid status")
    db = ctx["db"]
    sets = ["status = :status", "updated_at = NOW()"]
    params: dict = {"id": report_id, "status": status}
    if status == "approved":
        sets.extend(["approved_by = :approved_by", "approved_at = NOW()"])
        params["approved_by"] = ctx["sub"]
    elif status == "rejected":
        sets.append("rejection_reason = :reason")
        params["reason"] = rejection_reason or ""
    elif status == "paid":
        sets.append("paid_date = CURRENT_DATE")

    await db.execute(text(f"UPDATE expense_reports SET {', '.join(sets)} WHERE id = :id"), params)
    await db.commit()
    return {"status": status}


@router.delete("/expense-reports/{report_id}")
async def delete_expense_report(report_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(text("SELECT status FROM expense_reports WHERE id = :id"), {"id": report_id})
    report = result.fetchone()
    if not report:
        raise HTTPException(status_code=404, detail="Expense report not found")
    if report._mapping["status"] not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft reports can be deleted")
    await db.execute(text("DELETE FROM expense_items WHERE report_id = :id"), {"id": report_id})
    await db.execute(text("DELETE FROM expense_reports WHERE id = :id"), {"id": report_id})
    await db.commit()
    return {"ok": True}


# ── Reports ──────────────────────────────────────────────────────────────────

@router.get("/profit-analysis")
async def profit_analysis(
    dimension: str = Query("lead"),
    date_from: str | None = None,
    date_to: str | None = None,
    salesperson_id: str | None = None,
    status: str | None = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    if dimension not in ("lead", "customer", "salesperson"):
        raise HTTPException(status_code=400, detail="dimension must be lead, customer, or salesperson")

    # Build WHERE clause for contract_profit CTE
    conditions = ["1=1"]
    params: dict = {}
    if date_from:
        conditions.append("c.created_at >= :date_from")
        params["date_from"] = parse_date(date_from)
    if date_to:
        conditions.append("c.created_at <= :date_to")
        params["date_to"] = parse_date(date_to)
    if salesperson_id:
        conditions.append("c.sales_owner_id = :salesperson_id")
        params["salesperson_id"] = salesperson_id
    if status:
        conditions.append("c.status = :status")
        params["status"] = status

    # Role-based: salesperson can only see own data
    role = ctx.get("role", "")
    if role not in ("platform_admin", "tenant_admin"):
        conditions.append("c.sales_owner_id = :current_user")
        params["current_user"] = ctx["sub"]

    where = " AND ".join(conditions)

    cte = f"""
    WITH contract_profit AS (
      SELECT c.id, c.lead_id, c.account_id, c.sales_owner_id, c.status,
        COALESCE((SELECT SUM(r.amount) FROM crm_receivables r WHERE r.contract_id = c.id), 0) AS revenue,
        COALESCE((SELECT SUM(p.amount) FROM crm_payables p WHERE p.contract_id = c.id), 0) AS cost
      FROM crm_contracts c
      WHERE {where}
    )
    """

    if dimension == "lead":
        query = cte + """
        SELECT l.id, l.company_name AS name, l.status,
          COALESCE(SUM(cp.revenue), 0) AS total_revenue, COALESCE(SUM(cp.cost), 0) AS total_cost,
          COALESCE(SUM(cp.revenue), 0) - COALESCE(SUM(cp.cost), 0) AS gross_profit,
          CASE WHEN SUM(cp.revenue) > 0 THEN ROUND((SUM(cp.revenue)-SUM(cp.cost))/SUM(cp.revenue)*100, 2) ELSE 0 END AS margin_pct,
          COUNT(DISTINCT cp.id) AS contract_count
        FROM contract_profit cp JOIN leads l ON l.id = cp.lead_id
        GROUP BY l.id, l.company_name, l.status
        ORDER BY total_revenue DESC
        """
    elif dimension == "customer":
        query = cte + """
        SELECT a.id, a.name, NULL AS status,
          COALESCE(SUM(cp.revenue), 0) AS total_revenue, COALESCE(SUM(cp.cost), 0) AS total_cost,
          COALESCE(SUM(cp.revenue), 0) - COALESCE(SUM(cp.cost), 0) AS gross_profit,
          CASE WHEN SUM(cp.revenue) > 0 THEN ROUND((SUM(cp.revenue)-SUM(cp.cost))/SUM(cp.revenue)*100, 2) ELSE 0 END AS margin_pct,
          COUNT(DISTINCT cp.id) AS contract_count
        FROM contract_profit cp JOIN crm_accounts a ON a.id = cp.account_id
        GROUP BY a.id, a.name
        ORDER BY total_revenue DESC
        """
    else:  # salesperson
        query = cte + """
        SELECT u.id, u.display_name AS name, NULL AS status,
          COALESCE(SUM(cp.revenue), 0) AS total_revenue, COALESCE(SUM(cp.cost), 0) AS total_cost,
          COALESCE(SUM(cp.revenue), 0) - COALESCE(SUM(cp.cost), 0) AS gross_profit,
          CASE WHEN SUM(cp.revenue) > 0 THEN ROUND((SUM(cp.revenue)-SUM(cp.cost))/SUM(cp.revenue)*100, 2) ELSE 0 END AS margin_pct,
          COUNT(DISTINCT cp.id) AS contract_count
        FROM contract_profit cp JOIN users u ON u.id = cp.sales_owner_id
        GROUP BY u.id, u.display_name
        ORDER BY total_revenue DESC
        """

    result = await db.execute(text(query), params)
    rows = result.fetchall()
    return [
        {
            "id": str(row[0]),
            "name": row[1],
            "status": row[2],
            "total_revenue": float(row[3] or 0),
            "total_cost": float(row[4] or 0),
            "gross_profit": float(row[5] or 0),
            "margin_pct": float(row[6] or 0),
            "contract_count": int(row[7] or 0),
        }
        for row in rows
    ]


@router.get("/reports/pnl")
async def get_pnl_report(start: Optional[str] = None, end: Optional[str] = None, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    today = date.today()
    start_date = parse_date(start) if start else today.replace(month=1, day=1)
    end_date = parse_date(end) if end else today

    # Revenue: paid receivable invoices in period
    r = await db.execute(text("""
        SELECT COALESCE(SUM(p.amount), 0) FROM invoice_payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE i.type = 'receivable' AND p.payment_date >= :start AND p.payment_date <= :end
    """), {"start": start_date, "end": end_date})
    revenue = float(r.scalar() or 0)

    # COGS: paid payable invoices in period
    r = await db.execute(text("""
        SELECT COALESCE(SUM(p.amount), 0) FROM invoice_payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE i.type = 'payable' AND p.payment_date >= :start AND p.payment_date <= :end
    """), {"start": start_date, "end": end_date})
    cogs = float(r.scalar() or 0)

    # Operating expenses: paid expense reports in period
    r = await db.execute(text("SELECT COALESCE(SUM(total_amount), 0) FROM expense_reports WHERE status = 'paid' AND paid_date >= :start AND paid_date <= :end"), {"start": start_date, "end": end_date})
    operating_expenses = float(r.scalar() or 0)

    gross_profit = revenue - cogs
    net_profit = gross_profit - operating_expenses

    # Expense breakdown by category
    r = await db.execute(text("SELECT COALESCE(category, 'other') as category, SUM(total_amount) as total FROM expense_reports WHERE status = 'paid' AND paid_date >= :start AND paid_date <= :end GROUP BY category"), {"start": start_date, "end": end_date})
    expense_breakdown = [dict(row._mapping) for row in r.fetchall()]

    return {
        "period": {"start": str(start_date), "end": str(end_date)},
        "revenue": revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "operating_expenses": operating_expenses,
        "net_profit": net_profit,
        "expense_breakdown": expense_breakdown,
    }


@router.get("/reports/cashflow")
async def get_cashflow_report(months: int = 6, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    today = date.today()
    result = []
    for i in range(months - 1, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        m_start = date(y, m, 1)
        if m == 12:
            m_end = date(y + 1, 1, 1)
        else:
            m_end = date(y, m + 1, 1)

        # Inflow: receivable payments
        r = await db.execute(text("""
            SELECT COALESCE(SUM(p.amount), 0) FROM invoice_payments p
            JOIN invoices i ON p.invoice_id = i.id
            WHERE i.type = 'receivable' AND p.payment_date >= :s AND p.payment_date < :e
        """), {"s": m_start, "e": m_end})
        inflow = float(r.scalar() or 0)

        # Outflow: payable payments + expense reports paid
        r = await db.execute(text("""
            SELECT COALESCE(SUM(p.amount), 0) FROM invoice_payments p
            JOIN invoices i ON p.invoice_id = i.id
            WHERE i.type = 'payable' AND p.payment_date >= :s AND p.payment_date < :e
        """), {"s": m_start, "e": m_end})
        pay_out = float(r.scalar() or 0)
        r = await db.execute(text("SELECT COALESCE(SUM(total_amount), 0) FROM expense_reports WHERE status = 'paid' AND paid_date >= :s AND paid_date < :e"), {"s": m_start, "e": m_end})
        exp_out = float(r.scalar() or 0)

        result.append({"month": m_start.strftime("%Y-%m"), "inflow": inflow, "outflow": pay_out + exp_out})

    return result


@router.get("/reports/aging")
async def get_aging_report(type: str = "receivable", ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    today = date.today()

    r = await db.execute(text("""
        SELECT id, invoice_number, contact_name, due_date, total, COALESCE(paid_amount, 0) as paid_amount
        FROM invoices WHERE type = :type AND status NOT IN ('paid', 'cancelled') AND due_date IS NOT NULL
        ORDER BY due_date
    """), {"type": type})
    rows = r.fetchall()

    buckets = {"current": [], "days_30": [], "days_60": [], "days_90": [], "over_90": []}
    summary = {"current": 0, "days_30": 0, "days_60": 0, "days_90": 0, "over_90": 0}

    for row in rows:
        m = dict(row._mapping)
        outstanding = float(m["total"] or 0) - float(m["paid_amount"] or 0)
        m["outstanding"] = outstanding
        dd = m["due_date"]
        if dd is None:
            bucket = "current"
        else:
            days = (today - dd).days
            if days <= 0:
                bucket = "current"
            elif days <= 30:
                bucket = "days_30"
            elif days <= 60:
                bucket = "days_60"
            elif days <= 90:
                bucket = "days_90"
            else:
                bucket = "over_90"
        buckets[bucket].append(m)
        summary[bucket] += outstanding

    return {"summary": summary, "details": buckets}
