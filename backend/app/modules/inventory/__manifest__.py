MANIFEST = {
    "name": "Inventory",
    "slug": "inventory",
    "version": "1.0.0",
    "description": "Inventory & Supply Chain - products, warehouses, stock, purchase orders",
    "icon": "package",
    "depends": [],
    "api_prefix": "/inventory",
    "entities": ["product", "supplier"],
    "tables": [
        "products", "warehouses", "stock_movements",
        "purchase_orders", "suppliers", "supplier_quotations",
    ],
    "settings_schema": {
        "track_serial_numbers": {"type": "bool", "default": False},
        "default_warehouse": {"type": "str", "default": "main"},
    },
    "permissions": [
        "inventory.read", "inventory.write", "inventory.delete", "inventory.admin",
        "inventory.purchase.read", "inventory.purchase.write",
    ],
    "menu_items": [
        {"label": "Inventory", "path": "/inventory", "icon": "package", "sort": 7},
        {"label": "Orders", "path": "/orders", "icon": "shopping-cart", "sort": 8},
    ],
}
