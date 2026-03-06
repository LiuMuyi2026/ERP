MANIFEST = {
    "name": "HR",
    "slug": "hr",
    "version": "1.0.0",
    "description": "Human Resources - employees, leave requests, payroll, departments",
    "icon": "briefcase",
    "depends": [],
    "api_prefix": "/hr",
    "entities": ["employee"],
    "tables": [
        "employees", "departments", "leave_requests", "payroll_runs",
    ],
    "settings_schema": {
        "leave_types": {
            "type": "list",
            "default": ["annual", "sick", "personal", "maternity", "paternity", "other"],
        },
        "default_work_hours": {"type": "int", "default": 8},
    },
    "permissions": [
        "hr.read", "hr.write", "hr.delete", "hr.admin",
        "hr.payroll.read", "hr.payroll.write",
    ],
    "menu_items": [
        {"label": "HR", "path": "/hr", "icon": "briefcase", "sort": 6},
    ],
}
