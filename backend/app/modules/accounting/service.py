"""Accounting module service layer."""

import json
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.base_service import BaseService
from app.core.events import events

logger = logging.getLogger(__name__)


class InvoiceService(BaseService):
    table_name = "invoices"
    entity_type = "invoice"
    module_name = "accounting"
    display_name_field = "invoice_number"

    allowed_fields = {
        "invoice_number", "contact_name", "contact_email", "type",
        "issue_date", "due_date", "status", "subtotal", "tax_amount",
        "total_amount", "currency", "notes", "lead_id", "contract_id",
    }
    date_fields = {"issue_date", "due_date"}

    async def get_with_lines(self, invoice_id: str) -> dict | None:
        invoice = await self.get(invoice_id)
        if not invoice:
            return None
        lines = await self.db.execute(
            text("SELECT * FROM invoice_line_items WHERE invoice_id = :iid ORDER BY sort_order"),
            {"iid": invoice_id},
        )
        invoice["line_items"] = [dict(r._mapping) for r in lines.fetchall()]
        return invoice

    async def update_totals(self, invoice_id: str):
        """Recalculate invoice totals from line items."""
        await self.db.execute(
            text("""
                UPDATE invoices SET
                    subtotal = COALESCE((SELECT SUM(amount) FROM invoice_line_items WHERE invoice_id = :iid), 0),
                    total_amount = COALESCE((SELECT SUM(amount) FROM invoice_line_items WHERE invoice_id = :iid), 0)
                        + COALESCE(tax_amount, 0),
                    updated_at = NOW()
                WHERE id = :iid
            """),
            {"iid": invoice_id},
        )


class JournalEntryService(BaseService):
    table_name = "journal_entries"
    entity_type = ""
    module_name = "accounting"
    display_name_field = "description"

    allowed_fields = {
        "entry_number", "entry_date", "description", "status",
        "total_debit", "total_credit", "lines",
    }
    jsonb_fields = {"lines"}
    date_fields = {"entry_date"}

    async def post_entry(self, entry_id: str, *, user_id: str | None = None) -> dict | None:
        """Post a journal entry (change status from draft to posted)."""
        row = await self.db.execute(
            text("""
                UPDATE journal_entries SET status = 'posted', updated_at = NOW()
                WHERE id = :id AND status = 'draft'
                RETURNING *
            """),
            {"id": entry_id},
        )
        result = row.fetchone()
        if result:
            record = dict(result._mapping)
            await events.emit("accounting.journal_entry.posted", {
                "record": record,
                "user_id": user_id,
            })
            return record
        return None


class ChartOfAccountsService(BaseService):
    table_name = "chart_of_accounts"
    entity_type = ""
    module_name = "accounting"
    display_name_field = "name"

    allowed_fields = {
        "code", "name", "account_type", "category", "type",
        "parent_id", "is_active", "description", "currency",
    }
