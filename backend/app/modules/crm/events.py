"""
CRM module event handlers.

Reacts to events from other modules (messaging, accounting)
and emits events for cross-module communication.
"""

import logging
from app.core.events import events

logger = logging.getLogger(__name__)


def register_handlers():
    """Register CRM event handlers. Called by ModuleRegistry during startup."""

    @events.on("messaging.whatsapp.message_received")
    async def on_whatsapp_message(data: dict):
        """When a WhatsApp message is received, log interaction on the lead."""
        entity = data.get("entity")
        if not entity or entity.get("entity_type") not in ("lead", "customer"):
            return
        # The actual interaction logging is handled in the messaging module
        # This handler can be extended for CRM-specific reactions
        logger.debug(
            "CRM: WhatsApp message for %s (uid=%s)",
            entity.get("entity_type"),
            entity.get("uid"),
        )

    @events.on("accounting.invoice.created")
    async def on_invoice_created(data: dict):
        """When an invoice is created, check if it relates to a CRM contract."""
        record = data.get("record", {})
        contract_id = record.get("contract_id")
        if contract_id:
            logger.info("CRM: Invoice created for contract %s", contract_id)

    @events.on("messaging.email.received")
    async def on_email_received(data: dict):
        """When an email is received, try to match to a lead."""
        entity = data.get("entity")
        if entity and entity.get("entity_type") in ("lead", "customer"):
            logger.debug(
                "CRM: Email received for %s (uid=%s)",
                entity.get("entity_type"),
                entity.get("uid"),
            )
