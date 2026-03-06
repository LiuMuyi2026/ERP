"""CRM module seed data — default module definitions."""

import json
from sqlalchemy import text


CRM_MODULE_DEFS = [
    {
        "module": "crm", "doctype": "lead",
        "label": "Leads", "label_plural": "Lead Management",
        "icon": "people-group", "table_name": "leads",
        "fields": [
            {"fieldname": "full_name", "fieldtype": "Data", "label": "Name", "reqd": True, "in_list_view": True},
            {"fieldname": "company", "fieldtype": "Data", "label": "Company", "in_list_view": True},
            {"fieldname": "email", "fieldtype": "Data", "label": "Email", "options": "Email", "in_list_view": True},
            {"fieldname": "phone", "fieldtype": "Data", "label": "Phone", "options": "Phone"},
            {"fieldname": "whatsapp", "fieldtype": "Data", "label": "WhatsApp", "options": "Phone"},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "status", "fieldtype": "Select", "label": "Status",
             "options": "inquiry\nreplied\nqualified\nquoted\nnegotiating\nprocuring\nbooking\nfulfillment\npayment\nconverted\ncold\nlost",
             "reqd": True, "in_list_view": True, "in_standard_filter": True, "default": "inquiry"},
            {"fieldname": "source", "fieldtype": "Select", "label": "Source",
             "options": "website\nreferral\ncold_call\nemail\nsocial_media\nother",
             "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "assigned_to", "fieldtype": "Link", "label": "Assigned To", "options": "User", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "section_break_details", "fieldtype": "Section Break", "label": "Details"},
            {"fieldname": "familiarity_stage", "fieldtype": "Select", "label": "Familiarity",
             "options": "stranger\nacquaintance\nfamiliar\ntrusted"},
            {"fieldname": "wechat", "fieldtype": "Data", "label": "WeChat"},
            {"fieldname": "address", "fieldtype": "Data", "label": "Address"},
            {"fieldname": "section_break_notes", "fieldtype": "Section Break", "label": "Notes"},
            {"fieldname": "notes", "fieldtype": "Text", "label": "Notes"},
        ],
        "list_settings": {"sort_field": "created_at", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "full_name"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {
                "inquiry": "blue", "replied": "cyan", "qualified": "green",
                "quoted": "yellow", "negotiating": "orange", "procuring": "purple",
                "booking": "indigo", "fulfillment": "teal", "payment": "amber",
                "converted": "emerald", "cold": "gray", "lost": "red"
            }
        },
    },
    {
        "module": "crm", "doctype": "customer",
        "label": "Customer", "label_plural": "Customer Management",
        "icon": "building", "table_name": "crm_accounts",
        "fields": [
            {"fieldname": "name", "fieldtype": "Data", "label": "Company Name", "reqd": True, "in_list_view": True},
            {"fieldname": "industry", "fieldtype": "Data", "label": "Industry", "in_list_view": True},
            {"fieldname": "country", "fieldtype": "Data", "label": "Country", "in_list_view": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "credit_level", "fieldtype": "Select", "label": "Credit Level",
             "options": "A\nB\nC\nD", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "Status",
             "options": "active\ninactive\nblacklisted",
             "reqd": True, "in_list_view": True, "in_standard_filter": True, "default": "active"},
            {"fieldname": "section_break_notes", "fieldtype": "Section Break", "label": "Notes"},
            {"fieldname": "notes", "fieldtype": "Text", "label": "Notes"},
        ],
        "list_settings": {"sort_field": "created_at", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "name"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"active": "green", "inactive": "gray", "blacklisted": "red"}
        },
    },
    {
        "module": "crm", "doctype": "contract",
        "label": "Contract", "label_plural": "Contract Management",
        "icon": "scroll", "table_name": "crm_contracts",
        "fields": [
            {"fieldname": "contract_no", "fieldtype": "Data", "label": "Contract No", "reqd": True, "in_list_view": True},
            {"fieldname": "title", "fieldtype": "Data", "label": "Title", "reqd": True, "in_list_view": True},
            {"fieldname": "lead_id", "fieldtype": "Link", "label": "Customer", "options": "Lead", "in_list_view": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "amount", "fieldtype": "Currency", "label": "Amount", "reqd": True, "in_list_view": True},
            {"fieldname": "currency", "fieldtype": "Select", "label": "Currency", "options": "CNY\nUSD\nEUR\nGBP", "default": "CNY"},
            {"fieldname": "status", "fieldtype": "Select", "label": "Status",
             "options": "draft\nactive\ncompleted\ncancelled",
             "reqd": True, "in_list_view": True, "in_standard_filter": True, "default": "draft"},
            {"fieldname": "risk_level", "fieldtype": "Select", "label": "Risk Level",
             "options": "low\nmedium\nhigh", "default": "low", "in_standard_filter": True},
            {"fieldname": "section_break_dates", "fieldtype": "Section Break", "label": "Dates"},
            {"fieldname": "sign_date", "fieldtype": "Date", "label": "Sign Date"},
            {"fieldname": "start_date", "fieldtype": "Date", "label": "Start Date"},
            {"fieldname": "end_date", "fieldtype": "Date", "label": "End Date"},
            {"fieldname": "section_break_notes", "fieldtype": "Section Break", "label": "Notes"},
            {"fieldname": "notes", "fieldtype": "Text", "label": "Notes"},
        ],
        "list_settings": {"sort_field": "created_at", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "title"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"draft": "gray", "active": "green", "completed": "blue", "cancelled": "red"}
        },
    },
    {
        "module": "crm", "doctype": "receivable",
        "label": "Receivable", "label_plural": "Receivable Management",
        "icon": "money-bag", "table_name": "crm_receivables",
        "fields": [
            {"fieldname": "contract_id", "fieldtype": "Link", "label": "Contract", "options": "Contract", "in_list_view": True},
            {"fieldname": "amount", "fieldtype": "Currency", "label": "Amount", "reqd": True, "in_list_view": True},
            {"fieldname": "received_amount", "fieldtype": "Currency", "label": "Received", "in_list_view": True, "read_only": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "Status",
             "options": "pending\npartial\npaid\noverdue",
             "in_list_view": True, "in_standard_filter": True, "default": "pending"},
            {"fieldname": "due_date", "fieldtype": "Date", "label": "Due Date", "in_list_view": True},
            {"fieldname": "description", "fieldtype": "Text", "label": "Description"},
        ],
        "list_settings": {"sort_field": "due_date", "sort_order": "asc", "page_size": 50},
        "form_settings": {"title_field": "contract_id"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"pending": "yellow", "partial": "orange", "paid": "green", "overdue": "red"}
        },
    },
]


async def seed(db):
    """Seed CRM module definitions if none exist."""
    row = await db.execute(text(
        "SELECT COUNT(*) FROM module_definitions WHERE module = 'crm'"
    ))
    if row.scalar() > 0:
        return

    for i, defn in enumerate(CRM_MODULE_DEFS):
        await db.execute(text("""
            INSERT INTO module_definitions (module, doctype, label, label_plural, icon, table_name,
                fields, list_settings, form_settings, dashboard_settings, workflow_settings, sort_order)
            VALUES (:module, :doctype, :label, :label_plural, :icon, :table_name,
                CAST(:fields AS JSONB), CAST(:list_settings AS JSONB),
                CAST(:form_settings AS JSONB), '{}', CAST(:workflow_settings AS JSONB), :sort_order)
            ON CONFLICT (module, doctype) DO NOTHING
        """), {
            "module": defn["module"],
            "doctype": defn["doctype"],
            "label": defn.get("label", ""),
            "label_plural": defn.get("label_plural", ""),
            "icon": defn.get("icon", ""),
            "table_name": defn.get("table_name", ""),
            "fields": json.dumps(defn.get("fields", []), ensure_ascii=False),
            "list_settings": json.dumps(defn.get("list_settings", {})),
            "form_settings": json.dumps(defn.get("form_settings", {})),
            "workflow_settings": json.dumps(defn.get("workflow_settings", {})),
            "sort_order": i,
        })
    await db.commit()
