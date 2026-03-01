#!/usr/bin/env python3
"""
Backend smoke check.

Verifies:
1) database connectivity
2) required platform tables
3) tenant schema health preflight (missing tables + FK-blocking orphans)

Exit code:
- 0 on success
- 1 when any check fails
"""

import asyncio

from sqlalchemy import text

from app.database import AsyncSessionLocal


PLATFORM_TABLES = (
    "platform_admins",
    "tenants",
    "ai_usage_logs",
    "tenant_ai_configs",
)

TENANT_REQUIRED_TABLES = (
    "crm_contracts",
    "crm_receivables",
    "crm_receivable_payments",
    "crm_payables",
    "crm_payable_payments",
    "export_flow_orders",
    "export_flow_tasks",
)


async def table_exists(db, schema: str, table: str) -> bool:
    q = await db.execute(
        text(
            "SELECT EXISTS ("
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = :schema AND table_name = :table)"
        ),
        {"schema": schema, "table": table},
    )
    return bool(q.scalar())


async def count_scalar(db, sql: str) -> int:
    r = await db.execute(text(sql))
    return int(r.scalar() or 0)


async def main() -> int:
    failed = False

    async with AsyncSessionLocal() as db:
        # 1) DB connectivity
        try:
            await db.execute(text("SELECT 1"))
            print("DB connectivity: ok")
        except Exception as exc:
            print(f"DB connectivity: failed ({exc})")
            return 1

        # 2) Platform schema tables
        missing_platform = []
        for t in PLATFORM_TABLES:
            if not await table_exists(db, "platform", t):
                missing_platform.append(t)
        if missing_platform:
            failed = True
            print(f"Platform tables: missing {','.join(missing_platform)}")
        else:
            print("Platform tables: ok")

        # 3) Tenant preflight checks
        rows = await db.execute(text("SELECT slug FROM platform.tenants WHERE schema_provisioned = TRUE ORDER BY slug"))
        slugs = [r[0] for r in rows.fetchall()]
        print(f"Tenant schemas: {len(slugs)} provisioned")

        for slug in slugs:
            schema = f"tenant_{slug}"
            missing = [t for t in TENANT_REQUIRED_TABLES if not (await table_exists(db, schema, t))]
            if missing:
                failed = True
                print(f"[{slug}] missing_tables={','.join(missing)}")
                continue

            await db.execute(text(f'SET search_path TO "{schema}", public'))
            orphan_receivable_payments = await count_scalar(
                db,
                "SELECT COUNT(*) FROM crm_receivable_payments p "
                "WHERE NOT EXISTS (SELECT 1 FROM crm_receivables r WHERE r.id = p.receivable_id)",
            )
            orphan_payable_payments = await count_scalar(
                db,
                "SELECT COUNT(*) FROM crm_payable_payments p "
                "WHERE NOT EXISTS (SELECT 1 FROM crm_payables y WHERE y.id = p.payable_id)",
            )
            orphan_receivables = await count_scalar(
                db,
                "SELECT COUNT(*) FROM crm_receivables r "
                "WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = r.contract_id)",
            )
            orphan_payables = await count_scalar(
                db,
                "SELECT COUNT(*) FROM crm_payables p "
                "WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = p.contract_id)",
            )

            if any((orphan_receivable_payments, orphan_payable_payments, orphan_receivables, orphan_payables)):
                failed = True
                print(
                    f"[{slug}] orphan_receivable_payments={orphan_receivable_payments}, "
                    f"orphan_payable_payments={orphan_payable_payments}, "
                    f"orphan_receivables={orphan_receivables}, orphan_payables={orphan_payables}"
                )
            else:
                print(f"[{slug}] ok")

        await db.rollback()

    if failed:
        print("Smoke check: failed")
        return 1
    print("Smoke check: passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
