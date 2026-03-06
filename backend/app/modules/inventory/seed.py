"""Inventory module seed data."""

import json
from sqlalchemy import text

INVENTORY_MODULE_DEFS = [
    {
        "module": "inventory", "doctype": "product",
        "label": "Product", "label_plural": "Product Management",
        "icon": "package", "table_name": "products",
        "fields": [
            {"fieldname": "sku", "fieldtype": "Data", "label": "SKU", "reqd": True, "in_list_view": True},
            {"fieldname": "name", "fieldtype": "Data", "label": "Name", "reqd": True, "in_list_view": True},
            {"fieldname": "category", "fieldtype": "Data", "label": "Category", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "unit", "fieldtype": "Data", "label": "Unit", "default": "pcs"},
            {"fieldname": "cost_price", "fieldtype": "Currency", "label": "Cost"},
            {"fieldname": "sell_price", "fieldtype": "Currency", "label": "Price", "in_list_view": True},
            {"fieldname": "stock_qty", "fieldtype": "Int", "label": "Stock", "in_list_view": True},
            {"fieldname": "reorder_point", "fieldtype": "Int", "label": "Reorder Point", "default": "0"},
            {"fieldname": "section_break_desc", "fieldtype": "Section Break", "label": "Description"},
            {"fieldname": "description", "fieldtype": "Text", "label": "Description"},
        ],
        "list_settings": {"sort_field": "name", "sort_order": "asc", "page_size": 50},
        "form_settings": {"title_field": "name"},
        "workflow_settings": {},
    },
]


async def seed(db):
    row = await db.execute(text("SELECT COUNT(*) FROM module_definitions WHERE module = 'inventory'"))
    if row.scalar() > 0:
        return
    for i, defn in enumerate(INVENTORY_MODULE_DEFS):
        await db.execute(text("""
            INSERT INTO module_definitions (module, doctype, label, label_plural, icon, table_name,
                fields, list_settings, form_settings, dashboard_settings, workflow_settings, sort_order)
            VALUES (:module, :doctype, :label, :label_plural, :icon, :table_name,
                CAST(:fields AS JSONB), CAST(:list_settings AS JSONB),
                CAST(:form_settings AS JSONB), '{}', CAST(:workflow_settings AS JSONB), :sort_order)
            ON CONFLICT (module, doctype) DO NOTHING
        """), {
            "module": defn["module"], "doctype": defn["doctype"],
            "label": defn.get("label", ""), "label_plural": defn.get("label_plural", ""),
            "icon": defn.get("icon", ""), "table_name": defn.get("table_name", ""),
            "fields": json.dumps(defn.get("fields", []), ensure_ascii=False),
            "list_settings": json.dumps(defn.get("list_settings", {})),
            "form_settings": json.dumps(defn.get("form_settings", {})),
            "workflow_settings": json.dumps(defn.get("workflow_settings", {})),
            "sort_order": 300 + i,
        })
    await db.commit()
