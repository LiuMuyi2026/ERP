"""
Messaging module event handlers.

Integrates with entity_registry for WhatsApp/Email identity resolution.
"""

import logging
from app.core.events import events
from app.core import entity_registry as er

logger = logging.getLogger(__name__)


def register_handlers():
    """Register messaging event handlers."""

    @events.on("crm.lead.created")
    async def on_lead_created(data: dict):
        """When a lead is created with WhatsApp/phone, ensure entity_registry is updated."""
        record = data.get("record", {})
        phone = record.get("whatsapp") or record.get("phone")
        if phone:
            normalized = er.normalize_phone(phone)
            if normalized:
                logger.info(
                    "Messaging: Lead %s registered with phone %s",
                    record.get("id"), normalized,
                )

    @events.on("crm.lead.updated")
    async def on_lead_updated(data: dict):
        """When a lead's phone/email changes, entity_registry auto-updates via BaseService."""
        record = data.get("record", {})
        logger.debug("Messaging: Lead %s updated", record.get("id"))
