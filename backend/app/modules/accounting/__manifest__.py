MANIFEST = {
    "name": "Accounting",
    "slug": "accounting",
    "version": "1.0.0",
    "description": "Financial management - invoices, journal entries, chart of accounts",
    "icon": "calculator",
    "depends": [],
    "api_prefix": "/accounting",
    "entities": ["invoice", "journal_entry"],
    "tables": [
        "chart_of_accounts", "invoices", "invoice_line_items", "journal_entries",
    ],
    "settings_schema": {
        "fiscal_year_start": {"type": "str", "default": "01-01"},
        "default_currency": {"type": "str", "default": "CNY"},
    },
    "permissions": [
        "accounting.read", "accounting.write", "accounting.delete", "accounting.admin",
        "accounting.journal.post",
    ],
    "menu_items": [
        {"label": "Accounting", "path": "/accounting", "icon": "calculator", "sort": 5},
    ],
}
