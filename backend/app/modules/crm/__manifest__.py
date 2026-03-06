MANIFEST = {
    "name": "CRM",
    "slug": "crm",
    "version": "1.0.0",
    "description": "Customer Relationship Management - leads, contracts, receivables, deals",
    "icon": "users",
    "depends": [],
    "api_prefix": "/crm",
    "entities": ["lead", "customer", "contact", "company", "contract"],
    "tables": [
        "leads", "contacts", "companies", "crm_accounts",
        "crm_contracts", "crm_receivables", "crm_receivable_payments",
        "crm_payables", "crm_payable_payments",
        "interactions", "documents", "deals", "pipelines",
    ],
    "settings_schema": {
        "default_pipeline": {"type": "str", "default": "sales"},
        "auto_assign": {"type": "bool", "default": False},
        "lead_statuses": {
            "type": "list",
            "default": [
                "inquiry", "replied", "qualified", "quoted",
                "negotiating", "procuring", "booking",
                "fulfillment", "payment", "converted", "cold", "lost",
            ],
        },
    },
    "permissions": [
        "crm.read", "crm.write", "crm.delete", "crm.admin",
        "crm.contracts.read", "crm.contracts.write",
        "crm.receivables.read", "crm.receivables.write",
    ],
    "menu_items": [
        {"label": "CRM", "path": "/crm", "icon": "users", "sort": 1},
        {"label": "Customers", "path": "/crm/customers", "icon": "people-group", "sort": 2},
        {"label": "Contracts", "path": "/crm/contracts", "icon": "scroll", "sort": 3},
    ],
}
