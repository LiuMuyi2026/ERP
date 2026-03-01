import re
from datetime import date as date_type

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{0,98}[a-z0-9]$")
_RESERVED_SLUGS = {"public", "platform", "pg_catalog", "information_schema", "pg_toast"}


def validate_tenant_slug(slug: str) -> None:
    """Validate tenant slug format and reserved names."""
    if not slug or not _SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="Invalid tenant slug format")
    if slug in _RESERVED_SLUGS:
        raise HTTPException(status_code=400, detail="Reserved tenant slug")


async def safe_set_search_path(db: AsyncSession, slug: str) -> None:
    """Validate tenant slug format, reject reserved names, and set search_path safely."""
    validate_tenant_slug(slug)
    schema = f"tenant_{slug}"
    await db.execute(text("SET search_path TO " + _quote_ident(schema) + ", public"))


def _quote_ident(identifier: str) -> str:
    """Quote a PostgreSQL identifier to prevent injection."""
    return '"' + identifier.replace('"', '""') + '"'


def build_update_clause(
    data: dict,
    allowed_fields: set[str],
    *,
    jsonb_fields: set[str] | None = None,
) -> tuple[str, dict]:
    """Build a safe UPDATE SET clause from a dict.

    Only keys present in *allowed_fields* are included. Values are always
    parameterised. Returns (set_clause_str, params_dict).

    For JSONB columns listed in *jsonb_fields*, the SET part uses
    ``CAST(:col AS JSONB)`` so asyncpg can handle the type correctly.
    """
    if jsonb_fields is None:
        jsonb_fields = set()
    parts: list[str] = []
    params: dict = {}
    for key, value in data.items():
        if key not in allowed_fields:
            continue
        if key in jsonb_fields:
            parts.append(f"{key} = CAST(:{key} AS JSONB)")
        else:
            parts.append(f"{key} = :{key}")
        params[key] = value
    return ", ".join(parts), params


def parse_date(s: str | None) -> date_type | None:
    """Convert ISO date string to datetime.date; asyncpg requires date objects, not strings."""
    if not s:
        return None
    try:
        return date_type.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def parse_date_strict(s: str | None, field_name: str) -> date_type | None:
    """Parse ISO date strictly and raise 422 when format is invalid."""
    if s is None:
        return None
    if isinstance(s, str) and s.strip() == "":
        return None
    try:
        return date_type.fromisoformat(str(s))
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"Invalid date for {field_name}, expected YYYY-MM-DD")
