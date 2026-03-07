"""
CRM module event handlers.

Reacts to events from other modules (messaging, accounting)
and emits events for cross-module communication.
Also handles workflow step completion side-effects.
"""

import logging
from sqlalchemy import text

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

    @events.on("crm.workflow.step_completed")
    async def on_step_completed(data: dict):
        """React to workflow step completions with cross-module side-effects."""
        lead_id = data.get("lead_id")
        step_key = data.get("step_key")
        step_type = data.get("step_type")
        db = data.get("db")
        if not lead_id or not db:
            return

        # When follow_payment step is completed, check if receivables need updating
        if step_key == "follow_payment":
            logger.info("CRM: Payment follow-up completed for lead %s, checking receivables", lead_id)
            try:
                result = await db.execute(
                    text("""
                        SELECT r.id, r.amount, r.received_amount, r.status
                        FROM crm_receivables r
                        JOIN crm_contracts c ON c.id = r.contract_id
                        WHERE c.lead_id = CAST(:lid AS uuid) AND r.status != 'paid'
                        LIMIT 5
                    """),
                    {"lid": lead_id},
                )
                pending = result.fetchall()
                if pending:
                    logger.info("CRM: Lead %s has %d pending receivables", lead_id, len(pending))
            except Exception:
                logger.debug("CRM: Could not check receivables for lead %s (table may not exist)", lead_id)

        # When filing step is completed, log archival
        if step_key == "filing":
            logger.info("CRM: Filing/archival completed for lead %s", lead_id)
