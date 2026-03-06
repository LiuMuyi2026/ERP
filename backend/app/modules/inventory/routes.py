"""Inventory module routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.deps import get_current_user_with_tenant
from app.modules.inventory.service import ProductService, WarehouseService, SupplierService, PurchaseOrderService

router = APIRouter(tags=["inventory"])


# ── Products ───────────────────────────────────────────────────────────────

@router.get("/products")
async def list_products(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    category: Optional[str] = None,
    search: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = ProductService(ctx["db"])
    filters = {"category": category} if category else {}
    return await svc.list(
        page=page, size=size, filters=filters,
        search=search, search_fields=["name", "sku"],
    )


@router.get("/products/low-stock")
async def low_stock_products(ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ProductService(ctx["db"])
    return await svc.check_low_stock()


@router.get("/products/{product_id}")
async def get_product(product_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ProductService(ctx["db"])
    product = await svc.get(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("/products")
async def create_product(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ProductService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


@router.patch("/products/{product_id}")
async def update_product(product_id: str, body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ProductService(ctx["db"])
    record = await svc.update(product_id, body, user_id=ctx["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Product not found")
    await ctx["db"].commit()
    return record


@router.post("/products/{product_id}/stock-adjust")
async def adjust_stock(product_id: str, body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = ProductService(ctx["db"])
    qty = body.get("quantity", 0)
    reason = body.get("reason", "manual adjustment")
    await svc.adjust_stock(product_id, qty, reason, user_id=ctx["sub"])
    await ctx["db"].commit()
    return {"ok": True}


# ── Warehouses ─────────────────────────────────────────────────────────────

@router.get("/warehouses")
async def list_warehouses(ctx: dict = Depends(get_current_user_with_tenant)):
    svc = WarehouseService(ctx["db"])
    return await svc.list(size=100, sort_field="name", sort_order="asc")


@router.post("/warehouses")
async def create_warehouse(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = WarehouseService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


# ── Suppliers ──────────────────────────────────────────────────────────────

@router.get("/suppliers")
async def list_suppliers(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = SupplierService(ctx["db"])
    return await svc.list(
        page=page, size=size,
        search=search, search_fields=["name", "contact_person"],
    )


@router.post("/suppliers")
async def create_supplier(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = SupplierService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


# ── Purchase Orders ────────────────────────────────────────────────────────

@router.get("/purchase-orders")
async def list_purchase_orders(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = PurchaseOrderService(ctx["db"])
    filters = {"status": status} if status else {}
    return await svc.list(page=page, size=size, filters=filters)


@router.post("/purchase-orders")
async def create_purchase_order(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = PurchaseOrderService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record
