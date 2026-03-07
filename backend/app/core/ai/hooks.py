"""
AI Event Hooks — auto-trigger AI tasks on entity lifecycle events.

These hooks listen to events emitted by BaseService (create/update/delete)
and run AI tasks in the background. This is where the system becomes
"intelligent by default" — AI runs automatically, not just when users
click a button.

Registered during app startup via register_ai_hooks().
"""

import logging

from app.core.events import events

logger = logging.getLogger(__name__)


def register_ai_hooks():
    """Register all AI event hooks. Call once during app startup."""

    @events.on("crm.lead.created")
    async def on_lead_created(data: dict):
        """When a lead is created, enqueue auto-enrichment if enough data."""
        record = data.get("record", {})
        lead_id = str(record.get("id", ""))
        if not lead_id:
            return

        # Only auto-enrich if we have company info
        company = record.get("company", "")
        full_name = record.get("full_name", "")
        if not company and not full_name:
            return

        logger.info("AI hook: lead.created → enqueue enrichment for %s", lead_id)
        # Note: actual enrichment task would require a db session.
        # This hook emits a follow-up event that a background worker can pick up.
        await events.emit("ai.request.lead_enrich", {
            "lead_id": lead_id,
            "full_name": full_name,
            "company": company,
            "email": record.get("email", ""),
            "phone": record.get("phone", ""),
        })

    @events.on("crm.lead.updated")
    async def on_lead_status_change(data: dict):
        """When lead status changes to key stages, trigger AI analysis."""
        record = data.get("record", {})
        status = record.get("status", "")

        # Only trigger on meaningful status transitions
        if status not in ("qualified", "negotiating", "converted"):
            return

        lead_id = str(record.get("id", ""))
        logger.info("AI hook: lead status → %s for %s", status, lead_id)
        await events.emit("ai.request.lead_stage_analysis", {
            "lead_id": lead_id,
            "status": status,
            "full_name": record.get("full_name", ""),
            "company": record.get("company", ""),
        })

    @events.on("crm.contract.created")
    async def on_contract_created(data: dict):
        """When a contract is created, emit event for receivable plan suggestion."""
        record = data.get("record", {})
        contract_id = str(record.get("id", ""))
        amount = record.get("amount") or record.get("contract_amount")

        if not contract_id or not amount:
            return

        logger.info("AI hook: contract.created → suggest receivable plan for %s", contract_id)
        await events.emit("ai.request.receivable_plan", {
            "contract_id": contract_id,
            "amount": amount,
            "currency": record.get("currency", "CNY"),
        })

    logger.info("AI event hooks registered")
