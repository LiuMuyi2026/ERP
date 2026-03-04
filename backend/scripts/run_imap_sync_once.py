#!/usr/bin/env python3
"""Run one IMAP sync pass for all enabled tenants.

Intended for external scheduler/cron jobs (not the API process lifespan).
Exit code is always 0 unless a fatal bootstrap error occurs.
"""

import asyncio
from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.services.imap_sync import sync_tenant_imap
from app.utils.crypto import decrypt_api_key


async def main() -> int:
    async with AsyncSessionLocal() as db:
        rows = await db.execute(text(
            """
            SELECT slug, imap_enabled, imap_host, imap_port, imap_username,
                   imap_password, imap_password_encrypted, imap_use_ssl,
                   imap_mailbox, imap_timeout_seconds, imap_last_sync_at
            FROM platform.tenants
            WHERE is_active = TRUE AND schema_provisioned = TRUE AND imap_enabled = TRUE
            ORDER BY slug
            """
        ))
        tenants = rows.fetchall()

    if not tenants:
        print("IMAP sync: no enabled tenants")
        return 0

    for t in tenants:
        password = ""
        if t.imap_password_encrypted:
            try:
                password = decrypt_api_key(t.imap_password_encrypted)
            except Exception as e:
                print(f"[{t.slug}] decrypt failed: {e}")
                continue
        elif t.imap_password:
            password = t.imap_password

        cfg = {
            "imap_host": t.imap_host,
            "imap_port": t.imap_port,
            "imap_username": t.imap_username,
            "imap_password": password,
            "imap_use_ssl": t.imap_use_ssl,
            "imap_mailbox": t.imap_mailbox,
            "imap_timeout_seconds": t.imap_timeout_seconds,
            "imap_last_sync_at": t.imap_last_sync_at,
        }

        async with AsyncSessionLocal() as db:
            res = await sync_tenant_imap(t.slug, cfg, db)
            print(f"[{t.slug}] synced={res.get('synced', 0)} errors={len(res.get('errors', []))}")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
