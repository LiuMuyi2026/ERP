"""
CRM module service layer.

Extracted from the monolithic crm.py router. Contains all business logic
for leads, contracts, receivables, and deals.
"""

import json
import logging
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_service import BaseService
from app.core.entity_registry import register_entity, normalize_phone, normalize_email
from app.core.events import events

logger = logging.getLogger(__name__)


class LeadService(BaseService):
    """Service for lead/customer management."""

    table_name = "leads"
    entity_type = "lead"
    module_name = "crm"
    display_name_field = "full_name"
    phone_field = "phone"
    email_field = "email"

    allowed_fields = {
        "full_name", "company", "email", "phone", "whatsapp", "wechat",
        "status", "source", "assigned_to", "familiarity_stage", "address",
        "notes", "tags", "extra", "gender", "position", "website",
        "industry", "company_size", "annual_revenue", "country", "city",
    }
    jsonb_fields = {"tags", "extra"}
    date_fields: set[str] = set()

    async def create(self, data: dict, *, user_id: str | None = None) -> dict:
        """Create lead with entity registry + WhatsApp JID mapping."""
        record = await super().create(data, user_id=user_id)

        # Also register WhatsApp JID if phone/whatsapp provided
        whatsapp_phone = record.get("whatsapp") or record.get("phone")
        if whatsapp_phone:
            normalized = normalize_phone(whatsapp_phone)
            if normalized:
                # WhatsApp JID is typically phone@s.whatsapp.net
                digits = normalized.lstrip("+")
                jid = f"{digits}@s.whatsapp.net"
                try:
                    await register_entity(
                        self.db,
                        entity_type="lead",
                        entity_id=str(record["id"]),
                        whatsapp_jid=jid,
                    )
                except Exception:
                    logger.warning("Failed to register WhatsApp JID for lead %s", record["id"])

        return record

    async def search(
        self,
        query: str,
        *,
        page: int = 1,
        size: int = 50,
        status: str | None = None,
        assigned_to: str | None = None,
        sort_field: str = "created_at",
        sort_order: str = "desc",
    ) -> dict:
        """Search leads with filters."""
        filters = {}
        if status:
            filters["status"] = status
        if assigned_to:
            filters["assigned_to"] = assigned_to

        return await self.list(
            page=page,
            size=size,
            sort_field=sort_field,
            sort_order=sort_order,
            filters=filters,
            search=query if query else None,
            search_fields=["full_name", "company", "email", "phone"],
        )

    async def get_with_relations(self, lead_id: str) -> dict | None:
        """Get lead with contracts, receivables, and interaction history."""
        lead = await self.get(lead_id)
        if not lead:
            return None

        # Fetch contracts
        contracts = await self.db.execute(
            text("SELECT * FROM crm_contracts WHERE lead_id = :lid ORDER BY created_at DESC"),
            {"lid": lead_id},
        )
        lead["contracts"] = [dict(r._mapping) for r in contracts.fetchall()]

        # Fetch interactions
        interactions = await self.db.execute(
            text("SELECT * FROM interactions WHERE lead_id = :lid ORDER BY created_at DESC LIMIT 50"),
            {"lid": lead_id},
        )
        lead["interactions"] = [dict(r._mapping) for r in interactions.fetchall()]

        return lead

    async def bulk_assign(self, lead_ids: list[str], assigned_to: str) -> int:
        """Bulk assign leads to a user."""
        if not lead_ids:
            return 0
        # Use ANY for array comparison
        result = await self.db.execute(
            text("""
                UPDATE leads SET assigned_to = :assigned_to, updated_at = NOW()
                WHERE id = ANY(:ids)
            """),
            {"assigned_to": assigned_to, "ids": lead_ids},
        )
        return result.rowcount


class CustomerService(BaseService):
    """Service for customer (crm_accounts) management."""

    table_name = "crm_accounts"
    entity_type = "customer"
    module_name = "crm"
    display_name_field = "name"

    allowed_fields = {
        "name", "industry", "country", "credit_level",
        "status", "notes",
    }

    async def create(self, data: dict, *, user_id: str | None = None) -> dict:
        """Create customer and register in entity_registry with email from linked leads."""
        record = await super().create(data, user_id=user_id)
        return record

    async def get_with_details(self, account_id: str) -> dict | None:
        """Get customer with contracts, leads, and contacts."""
        account = await self.get(account_id)
        if not account:
            return None

        # Contracts under this account
        contracts = await self.db.execute(
            text("""
                SELECT c.*, l.full_name as lead_name
                FROM crm_contracts c
                LEFT JOIN leads l ON l.id = c.lead_id
                WHERE c.account_id = :aid
                ORDER BY c.created_at DESC
            """),
            {"aid": account_id},
        )
        account["contracts"] = [dict(r._mapping) for r in contracts.fetchall()]

        # Leads linked via contracts
        leads = await self.db.execute(
            text("""
                SELECT DISTINCT l.id, l.full_name, l.email, l.phone, l.whatsapp, l.status
                FROM leads l
                JOIN crm_contracts c ON c.lead_id = l.id
                WHERE c.account_id = :aid
            """),
            {"aid": account_id},
        )
        account["leads"] = [dict(r._mapping) for r in leads.fetchall()]

        return account

    async def search(
        self,
        query: str,
        *,
        page: int = 1,
        size: int = 50,
        status: str | None = None,
        sort_field: str = "created_at",
        sort_order: str = "desc",
    ) -> dict:
        filters = {}
        if status:
            filters["status"] = status
        return await self.list(
            page=page,
            size=size,
            sort_field=sort_field,
            sort_order=sort_order,
            filters=filters,
            search=query if query else None,
            search_fields=["name", "industry", "country"],
        )


class ContractService(BaseService):
    """Service for contract management."""

    table_name = "crm_contracts"
    entity_type = "contract"
    module_name = "crm"
    display_name_field = "title"

    allowed_fields = {
        "contract_no", "title", "account_id", "lead_id", "order_id",
        "contract_amount", "amount", "currency", "payment_method", "incoterm",
        "status", "risk_level", "sign_date", "eta", "start_date", "end_date",
        "sales_owner_id", "remarks", "notes", "attachments",
    }
    jsonb_fields = {"attachments"}
    date_fields = {"sign_date", "start_date", "end_date"}

    async def get_with_receivables(self, contract_id: str) -> dict | None:
        """Get contract with receivables and payments."""
        contract = await self.get(contract_id)
        if not contract:
            return None

        receivables = await self.db.execute(
            text("""
                SELECT r.*, COALESCE(
                    (SELECT SUM(amount) FROM crm_receivable_payments WHERE receivable_id = r.id),
                    0
                ) as paid_amount
                FROM crm_receivables r
                WHERE r.contract_id = :cid
                ORDER BY r.due_date
            """),
            {"cid": contract_id},
        )
        contract["receivables"] = [dict(r._mapping) for r in receivables.fetchall()]

        return contract


class ReceivableService(BaseService):
    """Service for receivable management."""

    table_name = "crm_receivables"
    entity_type = ""  # Not a standalone entity
    module_name = "crm"

    allowed_fields = {
        "contract_id", "amount", "currency", "due_date",
        "description", "status", "received_amount",
    }
    date_fields = {"due_date"}

    async def record_payment(self, receivable_id: str, amount: float, *, user_id: str | None = None) -> dict:
        """Record a payment against a receivable."""
        # Insert payment
        await self.db.execute(
            text("""
                INSERT INTO crm_receivable_payments (receivable_id, amount, payment_date, created_by)
                VALUES (:rid, :amount, NOW(), :user_id)
            """),
            {"rid": receivable_id, "amount": amount, "user_id": user_id},
        )

        # Update receivable totals
        row = await self.db.execute(
            text("""
                UPDATE crm_receivables SET
                    received_amount = COALESCE(
                        (SELECT SUM(amount) FROM crm_receivable_payments WHERE receivable_id = :rid),
                        0
                    ),
                    status = CASE
                        WHEN COALESCE(
                            (SELECT SUM(amount) FROM crm_receivable_payments WHERE receivable_id = :rid), 0
                        ) >= amount THEN 'paid'
                        WHEN COALESCE(
                            (SELECT SUM(amount) FROM crm_receivable_payments WHERE receivable_id = :rid), 0
                        ) > 0 THEN 'partial'
                        ELSE status
                    END,
                    updated_at = NOW()
                WHERE id = :rid
                RETURNING *
            """),
            {"rid": receivable_id},
        )
        result = row.fetchone()

        await events.emit("crm.receivable.payment_recorded", {
            "receivable_id": receivable_id,
            "amount": amount,
            "user_id": user_id,
        })

        return dict(result._mapping) if result else {}
