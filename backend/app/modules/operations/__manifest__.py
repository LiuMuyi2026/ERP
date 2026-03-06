MANIFEST = {
    "name": "Operations",
    "slug": "operations",
    "version": "1.0.0",
    "description": "Export flow operations - inquiries, quotations, shipments, approvals",
    "icon": "globe",
    "depends": ["crm", "inventory"],
    "api_prefix": "/operations",
    "entities": ["order"],
    "tables": [
        "inquiries", "quotations", "shipments",
        "export_flow_orders", "export_flow_tasks",
        "export_flow_approvals", "export_flow_docs", "export_flow_links",
    ],
    "settings_schema": {
        "default_workflow": {"type": "str", "default": "standard_export"},
    },
    "permissions": [
        "operations.read", "operations.write", "operations.delete", "operations.admin",
        "operations.approve",
    ],
    "menu_items": [
        {"label": "Operations", "path": "/operations", "icon": "globe", "sort": 9},
    ],
}
