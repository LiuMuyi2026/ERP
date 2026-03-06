"""Inventory module service layer."""

import logging
from sqlalchemy import text
from app.core.base_service import BaseService
from app.core.events import events

logger = logging.getLogger(__name__)


class ProductService(BaseService):
    table_name = "products"
    entity_type = "product"
    module_name = "inventory"
    display_name_field = "name"

    allowed_fields = {
        "sku", "name", "category", "unit", "cost_price", "sell_price",
        "stock_qty", "reorder_point", "description", "barcode",
        "weight", "dimensions", "is_active", "image_url",
    }

    async def check_low_stock(self) -> list[dict]:
        """Return products below reorder point."""
        rows = await self.db.execute(
            text("""
                SELECT * FROM products
                WHERE stock_qty <= reorder_point AND reorder_point > 0
                ORDER BY stock_qty ASC
            """)
        )
        return [dict(r._mapping) for r in rows.fetchall()]

    async def adjust_stock(self, product_id: str, qty_change: int, reason: str, *, user_id: str | None = None):
        """Adjust stock and record movement."""
        movement_type = "in" if qty_change > 0 else "out"
        await self.db.execute(
            text("""
                INSERT INTO stock_movements (product_id, quantity, movement_type, reason, created_by)
                VALUES (:pid, :qty, :mtype, :reason, :uid)
            """),
            {"pid": product_id, "qty": abs(qty_change), "mtype": movement_type, "reason": reason, "uid": user_id},
        )
        await self.db.execute(
            text("UPDATE products SET stock_qty = stock_qty + :change, updated_at = NOW() WHERE id = :pid"),
            {"change": qty_change, "pid": product_id},
        )
        await events.emit("inventory.stock.adjusted", {
            "product_id": product_id, "qty_change": qty_change, "reason": reason,
        })


class WarehouseService(BaseService):
    table_name = "warehouses"
    entity_type = ""
    module_name = "inventory"
    display_name_field = "name"

    allowed_fields = {"name", "code", "address", "is_active", "manager_id"}


class SupplierService(BaseService):
    table_name = "suppliers"
    entity_type = "supplier"
    module_name = "inventory"
    display_name_field = "name"
    phone_field = "phone"
    email_field = "email"

    allowed_fields = {
        "name", "contact_person", "phone", "email",
        "address", "website", "notes", "payment_terms",
        "rating", "is_active",
    }


class PurchaseOrderService(BaseService):
    table_name = "purchase_orders"
    entity_type = "order"
    module_name = "inventory"
    display_name_field = "po_number"

    allowed_fields = {
        "po_number", "supplier_id", "status", "order_date",
        "expected_date", "total_amount", "currency", "notes",
    }
    date_fields = {"order_date", "expected_date"}
