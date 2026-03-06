"""Accounting module seed data."""

import json
from sqlalchemy import text

ACCOUNTING_MODULE_DEFS = [
    {
        "module": "accounting", "doctype": "invoice",
        "label": "Invoice", "label_plural": "Invoice Management",
        "icon": "receipt", "table_name": "invoices",
        "fields": [
            {"fieldname": "invoice_number", "fieldtype": "Data", "label": "Invoice No", "in_list_view": True},
            {"fieldname": "contact_name", "fieldtype": "Data", "label": "Customer", "in_list_view": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "issue_date", "fieldtype": "Date", "label": "Issue Date", "reqd": True, "in_list_view": True},
            {"fieldname": "due_date", "fieldtype": "Date", "label": "Due Date", "in_list_view": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "Status",
             "options": "draft\nsent\npartial\npaid\noverdue",
             "default": "draft", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "section_break_amounts", "fieldtype": "Section Break", "label": "Amounts"},
            {"fieldname": "subtotal", "fieldtype": "Currency", "label": "Subtotal"},
            {"fieldname": "tax_amount", "fieldtype": "Currency", "label": "Tax"},
            {"fieldname": "total_amount", "fieldtype": "Currency", "label": "Total", "in_list_view": True},
            {"fieldname": "section_break_notes", "fieldtype": "Section Break", "label": "Notes"},
            {"fieldname": "notes", "fieldtype": "Text", "label": "Notes"},
        ],
        "list_settings": {"sort_field": "issue_date", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "invoice_number"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"draft": "gray", "sent": "blue", "partial": "orange", "paid": "green", "overdue": "red"}
        },
    },
    {
        "module": "accounting", "doctype": "journal_entry",
        "label": "Journal Entry", "label_plural": "Journal Entries",
        "icon": "ledger", "table_name": "journal_entries",
        "fields": [
            {"fieldname": "entry_date", "fieldtype": "Date", "label": "Date", "reqd": True, "in_list_view": True},
            {"fieldname": "description", "fieldtype": "Data", "label": "Description", "reqd": True, "in_list_view": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "total_debit", "fieldtype": "Currency", "label": "Total Debit", "in_list_view": True, "read_only": True},
            {"fieldname": "total_credit", "fieldtype": "Currency", "label": "Total Credit", "in_list_view": True, "read_only": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "Status",
             "options": "draft\nposted\ncancelled",
             "default": "draft", "in_list_view": True, "in_standard_filter": True},
        ],
        "list_settings": {"sort_field": "entry_date", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "description"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"draft": "gray", "posted": "green", "cancelled": "red"}
        },
    },
]


async def seed(db):
    row = await db.execute(text("SELECT COUNT(*) FROM module_definitions WHERE module = 'accounting'"))
    if row.scalar() > 0:
        return
    for i, defn in enumerate(ACCOUNTING_MODULE_DEFS):
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
            "sort_order": 100 + i,
        })
    await db.commit()
