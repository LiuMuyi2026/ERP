from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from app.deps import get_current_user_with_tenant
from app.utils.sql import build_update_clause
import uuid

router = APIRouter(prefix="/inventory", tags=["inventory"])


class SupplierCreate(BaseModel):
    name: str
    rating: Optional[str] = None
    company_info: Optional[str] = None
    contact_person: Optional[str] = None
    contact_info: Optional[str] = None
    supplier_type: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    rating: Optional[str] = None
    company_info: Optional[str] = None
    contact_person: Optional[str] = None
    contact_info: Optional[str] = None
    supplier_type: Optional[str] = None


class QuotationCreate(BaseModel):
    product_name: str
    material: Optional[str] = None
    spec: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    delivery_period: Optional[str] = None
    payment_method: Optional[str] = None
    special_requirements: Optional[str] = None


class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    unit: str = "each"
    cost_price: float = 0.0
    sell_price: float = 0.0
    currency: str = "USD"
    reorder_point: float = 0.0
    warehouse_id: Optional[str] = None


class StockAdjustment(BaseModel):
    product_id: str
    quantity: float
    movement_type: str = "adjustment"
    notes: Optional[str] = None


@router.get("/products")
async def list_products(category: Optional[str] = None, low_stock: bool = False, search: Optional[str] = None, limit: int = 50, offset: int = 0, ctx: dict = Depends(get_current_user_with_tenant)):
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    conditions = ["is_active = TRUE"]
    params: dict = {"limit": limit, "offset": offset}
    if category:
        conditions.append("category = :category")
        params["category"] = category
    if low_stock:
        conditions.append("current_stock <= reorder_point")
    if search:
        conditions.append("(name ILIKE :search OR sku ILIKE :search)")
        params["search"] = f"%{search}%"
    where = " AND ".join(conditions)
    result = await ctx["db"].execute(text(f"SELECT * FROM products WHERE {where} ORDER BY name LIMIT :limit OFFSET :offset"), params)
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/products")
async def create_product(body: ProductCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    prod_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text("INSERT INTO products (id, sku, name, description, category, unit, cost_price, sell_price, currency, reorder_point, warehouse_id) VALUES (:id, :sku, :name, :desc, :cat, :unit, :cost, :sell, :currency, :reorder, :warehouse)"),
        {"id": prod_id, "sku": body.sku, "name": body.name, "desc": body.description,
         "cat": body.category, "unit": body.unit, "cost": body.cost_price,
         "sell": body.sell_price, "currency": body.currency,
         "reorder": body.reorder_point, "warehouse": body.warehouse_id}
    )
    await ctx["db"].commit()
    return {"id": prod_id, "sku": body.sku}


@router.post("/products/{prod_id}/adjust-stock")
async def adjust_stock(prod_id: str, body: StockAdjustment, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    mv_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO stock_movements (id, product_id, quantity, movement_type, notes, created_by) VALUES (:id, :prod, :qty, :type, :notes, :creator)"),
        {"id": mv_id, "prod": prod_id, "qty": body.quantity, "type": body.movement_type, "notes": body.notes, "creator": ctx["sub"]}
    )
    await db.execute(
        text("UPDATE products SET current_stock = current_stock + :qty WHERE id = :id"),
        {"qty": body.quantity, "id": prod_id}
    )
    await db.commit()
    return {"movement_id": mv_id}


class WarehouseCreate(BaseModel):
    name: str
    address: Optional[str] = None
    is_active: bool = True


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/warehouses")
async def list_warehouses(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(text("SELECT * FROM warehouses ORDER BY name"))
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/warehouses")
async def create_warehouse(body: WarehouseCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    wh_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text("INSERT INTO warehouses (id, name, address, is_active) VALUES (:id, :name, :address, :active)"),
        {"id": wh_id, "name": body.name, "address": body.address, "active": body.is_active}
    )
    await ctx["db"].commit()
    return {"id": wh_id, "name": body.name}


_WAREHOUSE_UPDATE_FIELDS = {"name", "address", "is_active"}


@router.patch("/warehouses/{wh_id}")
async def update_warehouse(wh_id: str, body: WarehouseUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no changes"}
    set_clause, params = build_update_clause(updates, _WAREHOUSE_UPDATE_FIELDS)
    if not set_clause:
        return {"status": "no changes"}
    params["id"] = wh_id
    await ctx["db"].execute(text(f"UPDATE warehouses SET {set_clause} WHERE id = :id"), params)
    await ctx["db"].commit()
    return {"status": "ok"}


@router.delete("/warehouses/{wh_id}")
async def delete_warehouse(wh_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(text("DELETE FROM warehouses WHERE id = :id"), {"id": wh_id})
    await ctx["db"].commit()
    return {"status": "deleted"}


@router.get("/stock-movements")
async def list_movements(product_id: Optional[str] = None, ctx: dict = Depends(get_current_user_with_tenant)):
    params: dict = {}
    where = "1=1"
    if product_id:
        where = "product_id = :prod"
        params["prod"] = product_id
    result = await ctx["db"].execute(text(f"SELECT * FROM stock_movements WHERE {where} ORDER BY created_at DESC LIMIT 100"), params)
    return [dict(row._mapping) for row in result.fetchall()]


# ── Suppliers ─────────────────────────────────────────────────────────────────

@router.get("/supplier-types")
async def list_supplier_types(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(text("SELECT DISTINCT supplier_type FROM suppliers WHERE supplier_type IS NOT NULL AND supplier_type != '' ORDER BY supplier_type"))
    return [row[0] for row in result.fetchall()]


@router.get("/suppliers")
async def list_suppliers(search: Optional[str] = None, supplier_type: Optional[str] = None, ctx: dict = Depends(get_current_user_with_tenant)):
    params: dict = {}
    conditions = ["1=1"]
    if search:
        conditions.append("(name ILIKE :search OR contact_person ILIKE :search)")
        params["search"] = f"%{search}%"
    if supplier_type:
        conditions.append("supplier_type = :supplier_type")
        params["supplier_type"] = supplier_type
    where = " AND ".join(conditions)
    result = await ctx["db"].execute(text(f"SELECT * FROM suppliers WHERE {where} ORDER BY name"), params)
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/suppliers")
async def create_supplier(body: SupplierCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    sup_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text("INSERT INTO suppliers (id, name, rating, company_info, contact_person, contact_info, supplier_type) VALUES (:id, :name, :rating, :company_info, :contact_person, :contact_info, :supplier_type)"),
        {"id": sup_id, "name": body.name, "rating": body.rating, "company_info": body.company_info,
         "contact_person": body.contact_person, "contact_info": body.contact_info, "supplier_type": body.supplier_type}
    )
    await ctx["db"].commit()
    return {"id": sup_id, "name": body.name}


_SUPPLIER_UPDATE_FIELDS = {"name", "rating", "company_info", "contact_person", "contact_info", "supplier_type"}


@router.patch("/suppliers/{sup_id}")
async def update_supplier(sup_id: str, body: SupplierUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no changes"}
    set_clause, params = build_update_clause(updates, _SUPPLIER_UPDATE_FIELDS)
    if not set_clause:
        return {"status": "no changes"}
    params["id"] = sup_id
    await ctx["db"].execute(text(f"UPDATE suppliers SET {set_clause}, updated_at = NOW() WHERE id = :id"), params)
    await ctx["db"].commit()
    return {"status": "ok"}


@router.delete("/suppliers/{sup_id}")
async def delete_supplier(sup_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(text("DELETE FROM supplier_quotations WHERE supplier_id = :id"), {"id": sup_id})
    await ctx["db"].execute(text("DELETE FROM suppliers WHERE id = :id"), {"id": sup_id})
    await ctx["db"].commit()
    return {"status": "deleted"}


# ── Supplier Quotations ───────────────────────────────────────────────────────

@router.get("/suppliers/{sup_id}/quotations")
async def list_quotations(sup_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("SELECT * FROM supplier_quotations WHERE supplier_id = :sup_id ORDER BY created_at DESC"),
        {"sup_id": sup_id}
    )
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/suppliers/{sup_id}/quotations")
async def create_quotation(sup_id: str, body: QuotationCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    q_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text("""INSERT INTO supplier_quotations
               (id, supplier_id, product_name, material, spec, quantity, unit_price,
                delivery_period, payment_method, special_requirements)
               VALUES (:id, :sup_id, :product_name, :material, :spec, :quantity, :unit_price,
                       :delivery_period, :payment_method, :special_requirements)"""),
        {"id": q_id, "sup_id": sup_id, "product_name": body.product_name, "material": body.material,
         "spec": body.spec, "quantity": body.quantity, "unit_price": body.unit_price,
         "delivery_period": body.delivery_period, "payment_method": body.payment_method,
         "special_requirements": body.special_requirements}
    )
    await ctx["db"].commit()
    return {"id": q_id}


@router.delete("/suppliers/{sup_id}/quotations/{q_id}")
async def delete_quotation(sup_id: str, q_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(
        text("DELETE FROM supplier_quotations WHERE id = :id AND supplier_id = :sup_id"),
        {"id": q_id, "sup_id": sup_id}
    )
    await ctx["db"].commit()
    return {"status": "deleted"}
