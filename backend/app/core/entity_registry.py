"""
Entity Registry — Unified UID system for all business entities.

Every lead, customer, user, product, supplier etc. gets a NexusUID
that serves as the single source of truth for cross-module lookups.

UID Format: NXS-{TYPE}-{8-char hex}
  NXS-USR-a3f8b2c1  (system user  — highest priority)
  NXS-CUS-b7k2d4e9  (customer)
  NXS-LED-x9y3z7w1  (lead / prospect)
  NXS-PRD-c1m9f6g3  (product)
  NXS-SUP-d5p4h8j7  (supplier)
  NXS-EMP-e2n5k9l1  (employee)
  NXS-CON-f6q3m7o4  (contact)

WhatsApp / Email matching:
  Instead of fuzzy phone matching, we look up entity_registry by
  phone_e164 or whatsapp_jid to find the exact entity.
"""

import logging
import uuid
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Entity type prefixes
ENTITY_TYPES = {
    "user":     "USR",
    "customer": "CUS",
    "lead":     "LED",
    "product":  "PRD",
    "supplier": "SUP",
    "employee": "EMP",
    "contact":  "CON",
    "company":  "COM",
    "contract": "CTR",
    "invoice":  "INV",
    "order":    "ORD",
}

# Priority levels — higher number = higher priority in conflict resolution
ENTITY_PRIORITY = {
    "user":     100,
    "employee": 90,
    "customer": 80,
    "lead":     80,
    "contact":  70,
    "company":  60,
    "supplier": 50,
    "product":  40,
    "contract": 30,
    "invoice":  20,
    "order":    10,
}


def generate_uid(entity_type: str) -> str:
    """Generate a NexusUID like NXS-USR-a3f8b2c1."""
    prefix = ENTITY_TYPES.get(entity_type, "ENT")
    short_id = uuid.uuid4().hex[:8]
    return f"NXS-{prefix}-{short_id}"


def normalize_phone(phone: str | None) -> str | None:
    """Normalize phone to E.164 format (best effort)."""
    if not phone:
        return None
    # Strip all non-digit/plus characters
    digits = "".join(c for c in phone if c.isdigit() or c == "+")
    if not digits:
        return None
    # Ensure starts with +
    if not digits.startswith("+"):
        # Assume Chinese number if 11 digits starting with 1
        if len(digits) == 11 and digits.startswith("1"):
            digits = "+86" + digits
        else:
            digits = "+" + digits
    return digits


def normalize_email(email: str | None) -> str | None:
    """Normalize email to lowercase."""
    if not email:
        return None
    return email.strip().lower()


# ── DDL for entity_registry table ────────────────────────────────────────────

ENTITY_REGISTRY_DDL = """
CREATE TABLE IF NOT EXISTS entity_registry (
    uid VARCHAR(20) PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    display_name VARCHAR(255),
    phone_e164 VARCHAR(20),
    email_lower VARCHAR(255),
    whatsapp_jid VARCHAR(50),
    wechat_id VARCHAR(100),
    priority INTEGER NOT NULL DEFAULT 50,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_er_phone ON entity_registry(phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_er_email ON entity_registry(email_lower) WHERE email_lower IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_er_whatsapp ON entity_registry(whatsapp_jid) WHERE whatsapp_jid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_er_wechat ON entity_registry(wechat_id) WHERE wechat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_er_type ON entity_registry(entity_type);
CREATE INDEX IF NOT EXISTS idx_er_entity ON entity_registry(entity_id);
"""


# ── Service functions ────────────────────────────────────────────────────────

async def register_entity(
    db: AsyncSession,
    entity_type: str,
    entity_id: str,
    display_name: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    whatsapp_jid: str | None = None,
    wechat_id: str | None = None,
    metadata: dict | None = None,
) -> str:
    """Register an entity and return its NexusUID.

    If the entity already exists, updates contact info and returns existing UID.
    """
    # Check if already registered
    row = await db.execute(
        text("SELECT uid FROM entity_registry WHERE entity_type = :t AND entity_id = :eid"),
        {"t": entity_type, "eid": entity_id},
    )
    existing = row.fetchone()
    if existing:
        uid = existing.uid
        # Update contact info
        await _update_contact_info(
            db, uid, display_name, phone, email, whatsapp_jid, wechat_id, metadata
        )
        return uid

    uid = generate_uid(entity_type)
    priority = ENTITY_PRIORITY.get(entity_type, 50)

    await db.execute(
        text("""
            INSERT INTO entity_registry
                (uid, entity_type, entity_id, display_name, phone_e164, email_lower,
                 whatsapp_jid, wechat_id, priority, metadata)
            VALUES
                (:uid, :entity_type, :entity_id, :display_name, :phone_e164, :email_lower,
                 :whatsapp_jid, :wechat_id, :priority, CAST(:metadata AS JSONB))
            ON CONFLICT (entity_type, entity_id) DO UPDATE SET
                display_name = COALESCE(EXCLUDED.display_name, entity_registry.display_name),
                phone_e164 = COALESCE(EXCLUDED.phone_e164, entity_registry.phone_e164),
                email_lower = COALESCE(EXCLUDED.email_lower, entity_registry.email_lower),
                whatsapp_jid = COALESCE(EXCLUDED.whatsapp_jid, entity_registry.whatsapp_jid),
                wechat_id = COALESCE(EXCLUDED.wechat_id, entity_registry.wechat_id),
                updated_at = NOW()
        """),
        {
            "uid": uid,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "display_name": display_name,
            "phone_e164": normalize_phone(phone),
            "email_lower": normalize_email(email),
            "whatsapp_jid": whatsapp_jid,
            "wechat_id": wechat_id,
            "priority": priority,
            "metadata": "{}" if not metadata else __import__("json").dumps(metadata),
        },
    )
    return uid


async def _update_contact_info(
    db: AsyncSession,
    uid: str,
    display_name: str | None,
    phone: str | None,
    email: str | None,
    whatsapp_jid: str | None,
    wechat_id: str | None,
    metadata: dict | None,
):
    """Update contact info for an existing entity."""
    sets = ["updated_at = NOW()"]
    params: dict = {"uid": uid}

    if display_name:
        sets.append("display_name = :display_name")
        params["display_name"] = display_name
    if phone:
        sets.append("phone_e164 = :phone_e164")
        params["phone_e164"] = normalize_phone(phone)
    if email:
        sets.append("email_lower = :email_lower")
        params["email_lower"] = normalize_email(email)
    if whatsapp_jid:
        sets.append("whatsapp_jid = :whatsapp_jid")
        params["whatsapp_jid"] = whatsapp_jid
    if wechat_id:
        sets.append("wechat_id = :wechat_id")
        params["wechat_id"] = wechat_id

    if len(sets) > 1:  # more than just updated_at
        await db.execute(
            text(f"UPDATE entity_registry SET {', '.join(sets)} WHERE uid = :uid"),
            params,
        )


async def lookup_by_phone(db: AsyncSession, phone: str) -> dict | None:
    """Find the highest-priority entity by phone number."""
    normalized = normalize_phone(phone)
    if not normalized:
        return None
    row = await db.execute(
        text("""
            SELECT uid, entity_type, entity_id, display_name, phone_e164,
                   email_lower, whatsapp_jid, priority, metadata
            FROM entity_registry
            WHERE phone_e164 = :phone
            ORDER BY priority DESC
            LIMIT 1
        """),
        {"phone": normalized},
    )
    result = row.fetchone()
    return dict(result._mapping) if result else None


async def lookup_by_whatsapp(db: AsyncSession, jid: str) -> dict | None:
    """Find the highest-priority entity by WhatsApp JID."""
    if not jid:
        return None
    row = await db.execute(
        text("""
            SELECT uid, entity_type, entity_id, display_name, phone_e164,
                   email_lower, whatsapp_jid, priority, metadata
            FROM entity_registry
            WHERE whatsapp_jid = :jid
            ORDER BY priority DESC
            LIMIT 1
        """),
        {"jid": jid},
    )
    result = row.fetchone()
    return dict(result._mapping) if result else None


async def lookup_by_email(db: AsyncSession, email: str) -> dict | None:
    """Find the highest-priority entity by email."""
    normalized = normalize_email(email)
    if not normalized:
        return None
    row = await db.execute(
        text("""
            SELECT uid, entity_type, entity_id, display_name, phone_e164,
                   email_lower, whatsapp_jid, priority, metadata
            FROM entity_registry
            WHERE email_lower = :email
            ORDER BY priority DESC
            LIMIT 1
        """),
        {"email": normalized},
    )
    result = row.fetchone()
    return dict(result._mapping) if result else None


async def lookup_by_uid(db: AsyncSession, uid: str) -> dict | None:
    """Look up entity by its NexusUID."""
    row = await db.execute(
        text("""
            SELECT uid, entity_type, entity_id, display_name, phone_e164,
                   email_lower, whatsapp_jid, wechat_id, priority, metadata
            FROM entity_registry WHERE uid = :uid
        """),
        {"uid": uid},
    )
    result = row.fetchone()
    return dict(result._mapping) if result else None


async def lookup_by_entity(db: AsyncSession, entity_type: str, entity_id: str) -> dict | None:
    """Look up by entity_type + entity_id."""
    row = await db.execute(
        text("""
            SELECT uid, entity_type, entity_id, display_name, phone_e164,
                   email_lower, whatsapp_jid, wechat_id, priority, metadata
            FROM entity_registry WHERE entity_type = :t AND entity_id = :eid
        """),
        {"t": entity_type, "eid": entity_id},
    )
    result = row.fetchone()
    return dict(result._mapping) if result else None


async def search_entities(
    db: AsyncSession,
    query: str,
    entity_type: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Search entities by name, phone, or email."""
    where = ["(display_name ILIKE :q OR phone_e164 LIKE :phone_q OR email_lower LIKE :email_q)"]
    params: dict = {
        "q": f"%{query}%",
        "phone_q": f"%{query}%",
        "email_q": f"%{query.lower()}%",
        "limit": limit,
    }
    if entity_type:
        where.append("entity_type = :entity_type")
        params["entity_type"] = entity_type

    rows = await db.execute(
        text(f"""
            SELECT uid, entity_type, entity_id, display_name, phone_e164,
                   email_lower, whatsapp_jid, priority
            FROM entity_registry
            WHERE {' AND '.join(where)}
            ORDER BY priority DESC, display_name
            LIMIT :limit
        """),
        params,
    )
    return [dict(r._mapping) for r in rows.fetchall()]


async def unregister_entity(db: AsyncSession, entity_type: str, entity_id: str):
    """Remove an entity from the registry."""
    await db.execute(
        text("DELETE FROM entity_registry WHERE entity_type = :t AND entity_id = :eid"),
        {"t": entity_type, "eid": entity_id},
    )
