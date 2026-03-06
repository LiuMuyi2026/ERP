MANIFEST = {
    "name": "Messaging",
    "slug": "messaging",
    "version": "1.0.0",
    "description": "Unified messaging - WhatsApp, Email, internal chat",
    "icon": "message-circle",
    "depends": [],
    "api_prefix": "/messaging",
    "entities": [],
    "tables": [
        "whatsapp_contacts", "emails",
    ],
    "settings_schema": {
        "whatsapp_enabled": {"type": "bool", "default": False},
        "email_enabled": {"type": "bool", "default": False},
    },
    "permissions": [
        "messaging.read", "messaging.write",
        "messaging.whatsapp.admin",
        "messaging.email.admin",
    ],
    "menu_items": [
        {"label": "Messages", "path": "/messages", "icon": "message-circle", "sort": 3},
    ],
}
