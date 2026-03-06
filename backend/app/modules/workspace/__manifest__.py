MANIFEST = {
    "name": "Workspace",
    "slug": "workspace",
    "version": "1.0.0",
    "description": "Notion-style workspaces, pages, templates, and views",
    "icon": "layout",
    "depends": [],
    "api_prefix": "/workspace",
    "entities": [],
    "tables": [
        "workspaces", "pages",
    ],
    "settings_schema": {
        "enable_templates": {"type": "bool", "default": True},
        "enable_ai_assist": {"type": "bool", "default": True},
    },
    "permissions": [
        "workspace.read", "workspace.write", "workspace.delete", "workspace.admin",
        "workspace.share",
    ],
    "menu_items": [
        {"label": "Workspace", "path": "/workspace", "icon": "layout", "sort": 4},
    ],
}
