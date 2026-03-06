"""
Backfill entity_registry for all existing entities across all tenants.

Run this ONCE after deploying the entity_registry migration.
It registers all existing leads, users, employees, products, and suppliers.

Usage:
    cd backend
    python -m scripts.backfill_entity_registry
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from sqlalchemy import text
from app.database import AsyncSessionLocal
from app.core.entity_registry import (
    generate_uid, normalize_phone, normalize_email, ENTITY_PRIORITY,
)


async def backfill_tenant(slug: str):
    """Backfill entity_registry for a single tenant."""
    schema = f"tenant_{slug}"
    print(f"  Backfilling {schema}...")

    async with AsyncSessionLocal() as db:
        await db.execute(text(f'SET search_path TO "{schema}", public'))

        # Check if entity_registry exists
        check = await db.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = :schema AND table_name = 'entity_registry'
            )
        """), {"schema": schema})
        if not check.scalar():
            print(f"    entity_registry table missing, skipping")
            return

        count = 0

        # 1. Users (column is phone_number, not phone; also has wa_jid)
        rows = await db.execute(text("SELECT id, full_name, email, phone_number, wa_jid FROM users"))
        for r in rows.fetchall():
            uid = generate_uid("user")
            whatsapp_jid = getattr(r, 'wa_jid', None)
            try:
                await db.execute(text("""
                    INSERT INTO entity_registry (uid, entity_type, entity_id, display_name, phone_e164, email_lower, whatsapp_jid, priority)
                    VALUES (:uid, 'user', :eid, :name, :phone, :email, :jid, :priority)
                    ON CONFLICT (entity_type, entity_id) DO NOTHING
                """), {
                    "uid": uid, "eid": str(r.id), "name": r.full_name,
                    "phone": normalize_phone(getattr(r, 'phone_number', None)),
                    "email": normalize_email(r.email),
                    "jid": whatsapp_jid,
                    "priority": ENTITY_PRIORITY["user"],
                })
                count += 1
            except Exception as e:
                print(f"    Skipped user {r.id}: {e}")

        # 2. Leads
        rows = await db.execute(text("SELECT id, full_name, email, phone, whatsapp FROM leads"))
        for r in rows.fetchall():
            uid = generate_uid("lead")
            phone = getattr(r, 'whatsapp', None) or getattr(r, 'phone', None)
            whatsapp_jid = None
            if phone:
                normalized = normalize_phone(phone)
                if normalized:
                    digits = normalized.lstrip("+")
                    whatsapp_jid = f"{digits}@s.whatsapp.net"
            try:
                await db.execute(text("""
                    INSERT INTO entity_registry (uid, entity_type, entity_id, display_name, phone_e164, email_lower, whatsapp_jid, priority)
                    VALUES (:uid, 'lead', :eid, :name, :phone, :email, :jid, :priority)
                    ON CONFLICT (entity_type, entity_id) DO NOTHING
                """), {
                    "uid": uid, "eid": str(r.id), "name": r.full_name,
                    "phone": normalize_phone(phone),
                    "email": normalize_email(getattr(r, 'email', None)),
                    "jid": whatsapp_jid,
                    "priority": ENTITY_PRIORITY["lead"],
                })
                count += 1
            except Exception as e:
                print(f"    Skipped lead {r.id}: {e}")

        # 3. Employees
        try:
            rows = await db.execute(text("SELECT id, full_name, email, phone FROM employees"))
            for r in rows.fetchall():
                uid = generate_uid("employee")
                await db.execute(text("""
                    INSERT INTO entity_registry (uid, entity_type, entity_id, display_name, phone_e164, email_lower, priority)
                    VALUES (:uid, 'employee', :eid, :name, :phone, :email, :priority)
                    ON CONFLICT (entity_type, entity_id) DO NOTHING
                """), {
                    "uid": uid, "eid": str(r.id), "name": r.full_name,
                    "phone": normalize_phone(getattr(r, 'phone', None)),
                    "email": normalize_email(getattr(r, 'email', None)),
                    "priority": ENTITY_PRIORITY["employee"],
                })
                count += 1
        except Exception:
            pass  # Table might not exist

        # 4. Products
        try:
            rows = await db.execute(text("SELECT id, name FROM products"))
            for r in rows.fetchall():
                uid = generate_uid("product")
                await db.execute(text("""
                    INSERT INTO entity_registry (uid, entity_type, entity_id, display_name, priority)
                    VALUES (:uid, 'product', :eid, :name, :priority)
                    ON CONFLICT (entity_type, entity_id) DO NOTHING
                """), {
                    "uid": uid, "eid": str(r.id), "name": r.name,
                    "priority": ENTITY_PRIORITY["product"],
                })
                count += 1
        except Exception:
            pass

        # 5. Suppliers (contact_info is JSONB, no direct phone/email columns)
        try:
            rows = await db.execute(text("SELECT id, name, contact_info FROM suppliers"))
            for r in rows.fetchall():
                uid = generate_uid("supplier")
                ci = r.contact_info if r.contact_info else {}
                if isinstance(ci, str):
                    import json as _json
                    try:
                        ci = _json.loads(ci)
                    except Exception:
                        ci = {}
                await db.execute(text("""
                    INSERT INTO entity_registry (uid, entity_type, entity_id, display_name, phone_e164, email_lower, priority)
                    VALUES (:uid, 'supplier', :eid, :name, :phone, :email, :priority)
                    ON CONFLICT (entity_type, entity_id) DO NOTHING
                """), {
                    "uid": uid, "eid": str(r.id), "name": r.name,
                    "phone": normalize_phone(ci.get("phone") or ci.get("phone_number")),
                    "email": normalize_email(ci.get("email")),
                    "priority": ENTITY_PRIORITY["supplier"],
                })
                count += 1
        except Exception:
            pass

        # 6. Customers (crm_accounts) — pull email/phone from associated leads via crm_contracts
        try:
            rows = await db.execute(text("""
                SELECT a.id, a.name,
                       (SELECT l.email FROM crm_contracts c JOIN leads l ON l.id = c.lead_id
                        WHERE c.account_id = a.id AND l.email IS NOT NULL LIMIT 1) AS email,
                       (SELECT l.phone FROM crm_contracts c JOIN leads l ON l.id = c.lead_id
                        WHERE c.account_id = a.id AND l.phone IS NOT NULL LIMIT 1) AS phone,
                       (SELECT l.whatsapp FROM crm_contracts c JOIN leads l ON l.id = c.lead_id
                        WHERE c.account_id = a.id AND l.whatsapp IS NOT NULL LIMIT 1) AS whatsapp
                FROM crm_accounts a
            """))
            for r in rows.fetchall():
                uid = generate_uid("customer")
                wa_phone = getattr(r, 'whatsapp', None) or getattr(r, 'phone', None)
                whatsapp_jid = None
                if wa_phone:
                    normalized = normalize_phone(wa_phone)
                    if normalized:
                        whatsapp_jid = f"{normalized.lstrip('+')  }@s.whatsapp.net"
                await db.execute(text("""
                    INSERT INTO entity_registry (uid, entity_type, entity_id, display_name, phone_e164, email_lower, whatsapp_jid, priority)
                    VALUES (:uid, 'customer', :eid, :name, :phone, :email, :jid, :priority)
                    ON CONFLICT (entity_type, entity_id) DO NOTHING
                """), {
                    "uid": uid, "eid": str(r.id), "name": r.name,
                    "phone": normalize_phone(wa_phone),
                    "email": normalize_email(getattr(r, 'email', None)),
                    "jid": whatsapp_jid,
                    "priority": ENTITY_PRIORITY["customer"],
                })
                count += 1
        except Exception:
            pass

        # 7. Contacts
        try:
            rows = await db.execute(text("SELECT id, full_name, email, phone, whatsapp FROM contacts"))
            for r in rows.fetchall():
                uid = generate_uid("contact")
                phone = getattr(r, 'whatsapp', None) or getattr(r, 'phone', None)
                whatsapp_jid = None
                if phone:
                    normalized = normalize_phone(phone)
                    if normalized:
                        digits = normalized.lstrip("+")
                        whatsapp_jid = f"{digits}@s.whatsapp.net"
                await db.execute(text("""
                    INSERT INTO entity_registry (uid, entity_type, entity_id, display_name, phone_e164, email_lower, whatsapp_jid, priority)
                    VALUES (:uid, 'contact', :eid, :name, :phone, :email, :jid, :priority)
                    ON CONFLICT (entity_type, entity_id) DO NOTHING
                """), {
                    "uid": uid, "eid": str(r.id), "name": r.full_name,
                    "phone": normalize_phone(phone),
                    "email": normalize_email(getattr(r, 'email', None)),
                    "jid": whatsapp_jid,
                    "priority": ENTITY_PRIORITY["contact"],
                })
                count += 1
        except Exception:
            pass

        # 8. Companies
        try:
            rows = await db.execute(text("SELECT id, name FROM companies"))
            for r in rows.fetchall():
                uid = generate_uid("company")
                await db.execute(text("""
                    INSERT INTO entity_registry (uid, entity_type, entity_id, display_name, priority)
                    VALUES (:uid, 'company', :eid, :name, :priority)
                    ON CONFLICT (entity_type, entity_id) DO NOTHING
                """), {
                    "uid": uid, "eid": str(r.id), "name": r.name,
                    "priority": ENTITY_PRIORITY["company"],
                })
                count += 1
        except Exception:
            pass

        await db.commit()
        print(f"    Registered {count} entities")


async def main():
    print("Backfilling entity_registry for all tenants...")

    async with AsyncSessionLocal() as db:
        result = await db.execute(text(
            "SELECT slug FROM platform.tenants WHERE schema_provisioned = TRUE"
        ))
        slugs = [r[0] for r in result.fetchall()]

    print(f"Found {len(slugs)} tenant(s): {', '.join(slugs)}")

    for slug in slugs:
        await backfill_tenant(slug)

    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
