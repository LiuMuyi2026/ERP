"""Accounting module routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.deps import get_current_user_with_tenant
from app.modules.accounting.service import InvoiceService, JournalEntryService, ChartOfAccountsService

router = APIRouter(tags=["accounting"])


# ── Invoices ───────────────────────────────────────────────────────────────

@router.get("/invoices")
async def list_invoices(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = InvoiceService(ctx["db"])
    filters = {"status": status} if status else {}
    return await svc.list(page=page, size=size, filters=filters)


@router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = InvoiceService(ctx["db"])
    inv = await svc.get_with_lines(invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


@router.post("/invoices")
async def create_invoice(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = InvoiceService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


@router.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = InvoiceService(ctx["db"])
    record = await svc.update(invoice_id, body, user_id=ctx["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Invoice not found")
    await ctx["db"].commit()
    return record


# ── Journal Entries ────────────────────────────────────────────────────────

@router.get("/journal-entries")
async def list_journal_entries(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = JournalEntryService(ctx["db"])
    filters = {"status": status} if status else {}
    return await svc.list(page=page, size=size, filters=filters)


@router.post("/journal-entries")
async def create_journal_entry(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = JournalEntryService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


@router.post("/journal-entries/{entry_id}/post")
async def post_journal_entry(entry_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = JournalEntryService(ctx["db"])
    record = await svc.post_entry(entry_id, user_id=ctx["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Entry not found or already posted")
    await ctx["db"].commit()
    return record


# ── Chart of Accounts ──────────────────────────────────────────────────────

@router.get("/chart-of-accounts")
async def list_accounts(ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ChartOfAccountsService(ctx["db"])
    return await svc.list(size=500, sort_field="code", sort_order="asc")


@router.post("/chart-of-accounts")
async def create_account(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ChartOfAccountsService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record
