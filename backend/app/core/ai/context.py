"""
Unified Context Builder — pulls relevant data from any module for AI prompts.

Instead of each router building its own context, this provides a reusable
builder that fetches business data by entity type and ID.
"""

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ContextBuilder:
    """Builds structured context strings for AI prompts from business data."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._parts: list[str] = []

    def add(self, label: str, content: str) -> "ContextBuilder":
        """Add a labeled context section."""
        if content and content.strip():
            self._parts.append(f"【{label}】\n{content.strip()}")
        return self

    async def add_lead(self, lead_id: str) -> "ContextBuilder":
        """Fetch lead data and add to context."""
        row = await self.db.execute(
            text("SELECT * FROM leads WHERE id = :id"),
            {"id": lead_id},
        )
        lead = row.fetchone()
        if lead:
            m = lead._mapping
            lines = [
                f"Name: {m.get('full_name', '')}",
                f"Company: {m.get('company', '')}",
                f"Email: {m.get('email', '')}",
                f"Phone: {m.get('phone', '')}",
                f"Status: {m.get('status', '')}",
                f"Source: {m.get('source', '')}",
                f"Notes: {m.get('notes', '') or ''}",
            ]
            self._parts.append(f"【Lead】\n" + "\n".join(l for l in lines if not l.endswith(": ")))
        return self

    async def add_customer(self, customer_id: str) -> "ContextBuilder":
        """Fetch customer/account data."""
        row = await self.db.execute(
            text("SELECT * FROM crm_accounts WHERE id = :id"),
            {"id": customer_id},
        )
        acct = row.fetchone()
        if acct:
            m = acct._mapping
            lines = [
                f"Company: {m.get('name', '')}",
                f"Industry: {m.get('industry', '')}",
                f"Country: {m.get('country', '')}",
                f"Credit: {m.get('credit_level', '')}",
                f"Status: {m.get('status', '')}",
            ]
            self._parts.append(f"【Customer】\n" + "\n".join(l for l in lines if not l.endswith(": ")))
        return self

    async def add_contract(self, contract_id: str) -> "ContextBuilder":
        """Fetch contract data."""
        row = await self.db.execute(
            text("SELECT * FROM crm_contracts WHERE id = :id"),
            {"id": contract_id},
        )
        contract = row.fetchone()
        if contract:
            m = contract._mapping
            lines = [
                f"Contract No: {m.get('contract_no', '')}",
                f"Title: {m.get('title', '')}",
                f"Amount: {m.get('amount', '')} {m.get('currency', '')}",
                f"Status: {m.get('status', '')}",
                f"Risk: {m.get('risk_level', '')}",
            ]
            self._parts.append(f"【Contract】\n" + "\n".join(l for l in lines if not l.endswith(": ")))
        return self

    async def add_recent_interactions(self, lead_id: str, limit: int = 10) -> "ContextBuilder":
        """Fetch recent interaction history for a lead."""
        rows = await self.db.execute(
            text("""
                SELECT type, summary, created_at
                FROM interactions WHERE lead_id = :lid
                ORDER BY created_at DESC LIMIT :lim
            """),
            {"lid": lead_id, "lim": limit},
        )
        interactions = rows.fetchall()
        if interactions:
            lines = []
            for r in interactions:
                m = r._mapping
                lines.append(f"[{m.get('created_at', '')}] {m.get('type', '')}: {m.get('summary', '')}")
            self._parts.append(f"【Recent Interactions ({len(interactions)})】\n" + "\n".join(lines))
        return self

    async def add_whatsapp_messages(self, conversation_id: str, limit: int = 20) -> "ContextBuilder":
        """Fetch recent WhatsApp messages for context."""
        rows = await self.db.execute(
            text("""
                SELECT sender_name, body, created_at
                FROM whatsapp_messages
                WHERE conversation_id = :cid AND body IS NOT NULL AND body != ''
                ORDER BY created_at DESC LIMIT :lim
            """),
            {"cid": conversation_id, "lim": limit},
        )
        messages = rows.fetchall()
        if messages:
            lines = []
            for r in reversed(messages.copy()):
                m = r._mapping
                lines.append(f"{m.get('sender_name', 'Unknown')}: {m.get('body', '')}")
            self._parts.append(f"【WhatsApp Messages ({len(messages)})】\n" + "\n".join(lines))
        return self

    async def add_receivables_summary(self, contract_id: str) -> "ContextBuilder":
        """Fetch receivable summary for a contract."""
        row = await self.db.execute(
            text("""
                SELECT COUNT(*) as cnt,
                       COALESCE(SUM(amount), 0) as total,
                       COALESCE(SUM(received_amount), 0) as received,
                       COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
                FROM crm_receivables WHERE contract_id = :cid
            """),
            {"cid": contract_id},
        )
        r = row.fetchone()
        if r and r._mapping["cnt"] > 0:
            m = r._mapping
            self._parts.append(
                f"【Receivables】\n"
                f"Total: {m['total']}, Received: {m['received']}, "
                f"Outstanding: {float(m['total']) - float(m['received'])}, "
                f"Overdue: {m['overdue_count']} items"
            )
        return self

    async def add_search_results(self, query: str, tables: list[str] | None = None) -> "ContextBuilder":
        """Search across business tables by keyword (for chat context)."""
        if not query or not query.strip():
            return self

        default_tables = [
            ("leads", ["full_name", "company", "email", "phone"]),
            ("crm_accounts", ["name", "industry", "country"]),
            ("crm_contracts", ["contract_no", "title"]),
            ("employees", ["full_name", "email"]),
            ("products", ["name", "sku"]),
        ]

        results = []
        for table, fields in default_tables:
            if tables and table not in tables:
                continue
            conditions = " OR ".join(f"{f} ILIKE :q" for f in fields)
            try:
                rows = await self.db.execute(
                    text(f"SELECT * FROM {table} WHERE {conditions} LIMIT 5"),
                    {"q": f"%{query}%"},
                )
                for r in rows.fetchall():
                    m = dict(r._mapping)
                    label = m.get("full_name") or m.get("name") or m.get("title") or m.get("contract_no") or str(m.get("id", ""))[:8]
                    results.append(f"[{table}] {label}")
            except Exception:
                continue

        if results:
            self._parts.append(f"【DB Search: {query}】\n" + "\n".join(results))
        return self

    def build(self) -> str:
        """Build the final context string."""
        return "\n\n".join(self._parts)

    def is_empty(self) -> bool:
        return len(self._parts) == 0
