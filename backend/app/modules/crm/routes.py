"""
CRM module routes — thin API layer delegating to services.

This file replaces the monolithic app/routers/crm.py.
All business logic lives in service.py.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.deps import get_current_user_with_tenant, require_admin_with_tenant
from app.modules.crm.service import LeadService, CustomerService, ContractService, ReceivableService
from app.modules.crm.schemas import (
    LeadCreate, LeadUpdate,
    CustomerCreate, CustomerUpdate,
    ContractCreate, ContractUpdate,
    ReceivableCreate, ReceivableUpdate,
)

router = APIRouter(tags=["crm"])


# ── Leads ──────────────────────────────────────────────────────────────────

@router.get("/leads")
async def list_leads(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    sort: str = "created_at",
    order: str = "desc",
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = LeadService(ctx["db"])
    return await svc.search(
        query=search or "",
        page=page,
        size=size,
        status=status,
        assigned_to=assigned_to,
        sort_field=sort,
        sort_order=order,
    )


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = LeadService(ctx["db"])
    lead = await svc.get_with_relations(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.post("/leads")
async def create_lead(body: LeadCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = LeadService(ctx["db"])
    record = await svc.create(body.model_dump(exclude_none=True), user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = LeadService(ctx["db"])
    record = await svc.update(lead_id, body.model_dump(exclude_none=True), user_id=ctx["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Lead not found")
    await ctx["db"].commit()
    return record


@router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = LeadService(ctx["db"])
    deleted = await svc.delete(lead_id, user_id=ctx["sub"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Lead not found")
    await ctx["db"].commit()
    return {"ok": True}


@router.post("/leads/bulk-assign")
async def bulk_assign_leads(
    body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = LeadService(ctx["db"])
    count = await svc.bulk_assign(body.get("lead_ids", []), body.get("assigned_to", ""))
    await ctx["db"].commit()
    return {"ok": True, "updated": count}


# ── Customers (crm_accounts) ───────────────────────────────────────────────

@router.get("/customers")
async def list_customers(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    sort: str = "created_at",
    order: str = "desc",
    status: Optional[str] = None,
    search: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = CustomerService(ctx["db"])
    return await svc.search(
        query=search or "",
        page=page, size=size,
        status=status,
        sort_field=sort, sort_order=order,
    )


@router.get("/customers/{account_id}")
async def get_customer(account_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = CustomerService(ctx["db"])
    account = await svc.get_with_details(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Customer not found")
    return account


@router.post("/customers")
async def create_customer(body: CustomerCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = CustomerService(ctx["db"])
    record = await svc.create(body.model_dump(exclude_none=True), user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


@router.patch("/customers/{account_id}")
async def update_customer(account_id: str, body: CustomerUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = CustomerService(ctx["db"])
    record = await svc.update(account_id, body.model_dump(exclude_none=True), user_id=ctx["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Customer not found")
    await ctx["db"].commit()
    return record


@router.delete("/customers/{account_id}")
async def delete_customer(account_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = CustomerService(ctx["db"])
    deleted = await svc.delete(account_id, user_id=ctx["sub"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Customer not found")
    await ctx["db"].commit()
    return {"ok": True}


# ── Contracts ──────────────────────────────────────────────────────────────

@router.get("/contracts")
async def list_contracts(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    sort: str = "created_at",
    order: str = "desc",
    status: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = ContractService(ctx["db"])
    filters = {}
    if status:
        filters["status"] = status
    return await svc.list(page=page, size=size, sort_field=sort, sort_order=order, filters=filters)


@router.get("/contracts/{contract_id}")
async def get_contract(contract_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ContractService(ctx["db"])
    contract = await svc.get_with_receivables(contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract


@router.post("/contracts")
async def create_contract(body: ContractCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ContractService(ctx["db"])
    record = await svc.create(body.model_dump(exclude_none=True), user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


@router.patch("/contracts/{contract_id}")
async def update_contract(contract_id: str, body: ContractUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ContractService(ctx["db"])
    record = await svc.update(contract_id, body.model_dump(exclude_none=True), user_id=ctx["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Contract not found")
    await ctx["db"].commit()
    return record


@router.delete("/contracts/{contract_id}")
async def delete_contract(contract_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ContractService(ctx["db"])
    deleted = await svc.delete(contract_id, user_id=ctx["sub"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Contract not found")
    await ctx["db"].commit()
    return {"ok": True}


# ── Receivables ────────────────────────────────────────────────────────────

@router.get("/receivables")
async def list_receivables(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    contract_id: Optional[str] = None,
    status: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = ReceivableService(ctx["db"])
    filters = {}
    if contract_id:
        filters["contract_id"] = contract_id
    if status:
        filters["status"] = status
    return await svc.list(page=page, size=size, filters=filters)


@router.post("/receivables")
async def create_receivable(body: ReceivableCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ReceivableService(ctx["db"])
    record = await svc.create(body.model_dump(exclude_none=True), user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


@router.post("/receivables/{receivable_id}/payment")
async def record_payment(
    receivable_id: str,
    body: dict,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = ReceivableService(ctx["db"])
    amount = body.get("amount", 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    result = await svc.record_payment(receivable_id, amount, user_id=ctx["sub"])
    await ctx["db"].commit()
    return result
