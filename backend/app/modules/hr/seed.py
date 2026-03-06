"""HR module seed data."""

import json
from sqlalchemy import text

HR_MODULE_DEFS = [
    {
        "module": "hr", "doctype": "employee",
        "label": "Employee", "label_plural": "Employee Management",
        "icon": "necktie", "table_name": "employees",
        "fields": [
            {"fieldname": "employee_number", "fieldtype": "Data", "label": "Employee No", "in_list_view": True},
            {"fieldname": "full_name", "fieldtype": "Data", "label": "Name", "reqd": True, "in_list_view": True},
            {"fieldname": "email", "fieldtype": "Data", "label": "Email", "options": "Email", "in_list_view": True},
            {"fieldname": "phone", "fieldtype": "Data", "label": "Phone", "options": "Phone"},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "department_id", "fieldtype": "Link", "label": "Department", "options": "Department", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "position_id", "fieldtype": "Link", "label": "Position", "options": "Position", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "employment_type", "fieldtype": "Select", "label": "Type",
             "options": "full_time\npart_time\ncontract\nintern",
             "default": "full_time", "in_standard_filter": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "Status",
             "options": "active\non_leave\nresigned\nterminated",
             "default": "active", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "section_break_dates", "fieldtype": "Section Break", "label": "Employment"},
            {"fieldname": "start_date", "fieldtype": "Date", "label": "Start Date"},
            {"fieldname": "end_date", "fieldtype": "Date", "label": "End Date"},
        ],
        "list_settings": {"sort_field": "employee_number", "sort_order": "asc", "page_size": 50},
        "form_settings": {"title_field": "full_name"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"active": "green", "on_leave": "yellow", "resigned": "gray", "terminated": "red"}
        },
    },
    {
        "module": "hr", "doctype": "leave_request",
        "label": "Leave Request", "label_plural": "Leave Management",
        "icon": "calendar", "table_name": "leave_requests",
        "fields": [
            {"fieldname": "employee_id", "fieldtype": "Link", "label": "Employee", "options": "Employee", "reqd": True, "in_list_view": True},
            {"fieldname": "leave_type", "fieldtype": "Select", "label": "Type",
             "options": "annual\nsick\npersonal\nmaternity\npaternity\nother",
             "reqd": True, "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "start_date", "fieldtype": "Date", "label": "Start", "reqd": True, "in_list_view": True},
            {"fieldname": "end_date", "fieldtype": "Date", "label": "End", "reqd": True, "in_list_view": True},
            {"fieldname": "days", "fieldtype": "Float", "label": "Days", "in_list_view": True, "read_only": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "Status",
             "options": "pending\napproved\nrejected",
             "default": "pending", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "reason", "fieldtype": "Text", "label": "Reason"},
        ],
        "list_settings": {"sort_field": "created_at", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "employee_id"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"pending": "yellow", "approved": "green", "rejected": "red"}
        },
    },
]


async def seed(db):
    row = await db.execute(text("SELECT COUNT(*) FROM module_definitions WHERE module = 'hr'"))
    if row.scalar() > 0:
        return
    for i, defn in enumerate(HR_MODULE_DEFS):
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
            "sort_order": 200 + i,
        })
    await db.commit()
