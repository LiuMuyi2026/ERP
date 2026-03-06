"""
Base service class for all module services.

Provides standard CRUD operations, pagination, and entity registry
integration so modules don't have to re-implement boilerplate.
"""

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.entity_registry import register_entity, unregister_entity
from app.core.events import events
from app.utils.sql import parse_date

logger = logging.getLogger(__name__)


class BaseService:
    """Base service with standard CRUD + entity registry integration."""

    # Subclasses must set these
    table_name: str = ""
    entity_type: str = ""           # e.g. "lead", "product"
    module_name: str = ""           # e.g. "crm", "inventory"
    display_name_field: str = ""    # e.g. "full_name", "name"
    phone_field: str = ""           # field name for phone
    email_field: str = ""           # field name for email

    # Fields allowed in create/update (subclasses override)
    allowed_fields: set[str] = set()
    jsonb_fields: set[str] = set()
    date_fields: set[str] = set()

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── List / Pagination ──────────────────────────────────────────────────

    async def list(
        self,
        *,
        page: int = 1,
        size: int = 50,
        sort_field: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
        search: str | None = None,
        search_fields: list[str] | None = None,
    ) -> dict:
        """Generic paginated list with filters."""
        where_clauses = []
        params: dict[str, Any] = {}

        # Apply filters
        if filters:
            for i, (field, value) in enumerate(filters.items()):
                if value is not None and value != "":
                    key = f"filter_{i}"
                    where_clauses.append(f"{field} = :{key}")
                    params[key] = value

        # Apply search
        if search and search_fields:
            search_parts = []
            for sf in search_fields:
                search_parts.append(f"{sf} ILIKE :search_q")
            where_clauses.append(f"({' OR '.join(search_parts)})")
            params["search_q"] = f"%{search}%"

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        # Validate sort
        safe_sort_order = "ASC" if sort_order.upper() == "ASC" else "DESC"

        # Count
        count_row = await self.db.execute(
            text(f"SELECT COUNT(*) FROM {self.table_name} {where_sql}"),
            params,
        )
        total = count_row.scalar() or 0

        # Fetch
        offset = (page - 1) * size
        params["limit"] = size
        params["offset"] = offset

        rows = await self.db.execute(
            text(f"""
                SELECT * FROM {self.table_name}
                {where_sql}
                ORDER BY {sort_field} {safe_sort_order}
                LIMIT :limit OFFSET :offset
            """),
            params,
        )
        data = [dict(r._mapping) for r in rows.fetchall()]

        return {
            "data": data,
            "pagination": {
                "total": total,
                "page": page,
                "size": size,
                "pages": (total + size - 1) // size if size > 0 else 0,
            },
        }

    # ── Get by ID ──────────────────────────────────────────────────────────

    async def get(self, entity_id: str) -> dict | None:
        """Get a single record by ID."""
        row = await self.db.execute(
            text(f"SELECT * FROM {self.table_name} WHERE id = :id"),
            {"id": entity_id},
        )
        result = row.fetchone()
        return dict(result._mapping) if result else None

    # ── Create ─────────────────────────────────────────────────────────────

    async def create(self, data: dict, *, user_id: str | None = None) -> dict:
        """Create a record and register in entity_registry if applicable."""
        # Filter to allowed fields
        filtered = {k: v for k, v in data.items() if k in self.allowed_fields}

        # Parse dates
        for df in self.date_fields:
            if df in filtered and isinstance(filtered[df], str):
                filtered[df] = parse_date(filtered[df])

        # Serialize JSONB
        for jf in self.jsonb_fields:
            if jf in filtered and not isinstance(filtered[jf], str):
                filtered[jf] = json.dumps(filtered[jf], ensure_ascii=False)

        if user_id:
            filtered["created_by"] = user_id

        columns = ", ".join(filtered.keys())
        placeholders = ", ".join(
            f"CAST(:{k} AS JSONB)" if k in self.jsonb_fields else f":{k}"
            for k in filtered.keys()
        )

        row = await self.db.execute(
            text(f"""
                INSERT INTO {self.table_name} ({columns})
                VALUES ({placeholders})
                RETURNING *
            """),
            filtered,
        )
        record = dict(row.fetchone()._mapping)

        # Register entity
        if self.entity_type:
            await self._register(record)

        # Emit event
        await events.emit(f"{self.module_name}.{self.entity_type}.created", {
            "record": record,
            "user_id": user_id,
        })

        return record

    # ── Update ─────────────────────────────────────────────────────────────

    async def update(self, entity_id: str, data: dict, *, user_id: str | None = None) -> dict | None:
        """Update a record."""
        filtered = {k: v for k, v in data.items() if k in self.allowed_fields}
        if not filtered:
            return await self.get(entity_id)

        for df in self.date_fields:
            if df in filtered and isinstance(filtered[df], str):
                filtered[df] = parse_date(filtered[df])

        for jf in self.jsonb_fields:
            if jf in filtered and not isinstance(filtered[jf], str):
                filtered[jf] = json.dumps(filtered[jf], ensure_ascii=False)

        sets = []
        for k in filtered:
            if k in self.jsonb_fields:
                sets.append(f"{k} = CAST(:{k} AS JSONB)")
            else:
                sets.append(f"{k} = :{k}")
        sets.append("updated_at = NOW()")

        filtered["id"] = entity_id

        row = await self.db.execute(
            text(f"""
                UPDATE {self.table_name}
                SET {', '.join(sets)}
                WHERE id = :id
                RETURNING *
            """),
            filtered,
        )
        result = row.fetchone()
        if not result:
            return None

        record = dict(result._mapping)

        # Update entity registry
        if self.entity_type:
            await self._register(record)

        await events.emit(f"{self.module_name}.{self.entity_type}.updated", {
            "record": record,
            "user_id": user_id,
        })

        return record

    # ── Delete ─────────────────────────────────────────────────────────────

    async def delete(self, entity_id: str, *, user_id: str | None = None) -> bool:
        """Delete a record and unregister from entity_registry."""
        result = await self.db.execute(
            text(f"DELETE FROM {self.table_name} WHERE id = :id RETURNING id"),
            {"id": entity_id},
        )
        deleted = result.fetchone()
        if not deleted:
            return False

        if self.entity_type:
            await unregister_entity(self.db, self.entity_type, entity_id)

        await events.emit(f"{self.module_name}.{self.entity_type}.deleted", {
            "entity_id": entity_id,
            "user_id": user_id,
        })

        return True

    # ── Entity Registry Integration ──────────────────────────────────────

    async def _register(self, record: dict):
        """Register/update entity in the entity registry."""
        if not self.entity_type:
            return
        try:
            await register_entity(
                self.db,
                entity_type=self.entity_type,
                entity_id=str(record["id"]),
                display_name=record.get(self.display_name_field) if self.display_name_field else None,
                phone=record.get(self.phone_field) if self.phone_field else None,
                email=record.get(self.email_field) if self.email_field else None,
            )
        except Exception:
            logger.warning("Failed to register entity %s/%s", self.entity_type, record.get("id"))
