#!/usr/bin/env python3
"""
Check tenant schema migration health for all provisioned tenants.

This is a read-only preflight that reports:
- missing core tables
- orphan rows that would block strict FK migrations

Exit code:
- 0: all checks passed
- 1: at least one tenant has issues
"""

import asyncio
from dataclasses import dataclass, field

from sqlalchemy import text

from app.database import AsyncSessionLocal


REQUIRED_TABLES = (
    "crm_contracts",
    "crm_receivables",
    "crm_receivable_payments",
    "crm_payables",
    "crm_payable_payments",
    "export_flow_orders",
    "export_flow_tasks",
)


@dataclass
class TenantIssues:
    slug: str
    missing_tables: list[str] = field(default_factory=list)
    orphan_receivable_payments: int = 0
    orphan_payable_payments: int = 0
    orphan_receivables: int = 0
    orphan_payables: int = 0

    @property
    def has_issues(self) -> bool:
        return bool(
            self.missing_tables
            or self.orphan_receivable_payments
            or self.orphan_payable_payments
            or self.orphan_receivables
            or self.orphan_payables
        )


async def get_tenant_slugs() -> list[str]:
    async with AsyncSessionLocal() as db:
        rows = await db.execute(text("SELECT slug FROM platform.tenants WHERE schema_provisioned = TRUE ORDER BY slug"))
        return [r[0] for r in rows.fetchall()]


async def set_search_path(db, slug: str) -> None:
    await db.execute(text(f'SET search_path TO "tenant_{slug}", public'))


async def table_exists(db, table_name: str) -> bool:
    exists = await db.execute(
        text(
            "SELECT EXISTS ("
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = current_schema() AND table_name = :name)"
        ),
        {"name": table_name},
    )
    return bool(exists.scalar())


async def count_scalar(db, sql: str) -> int:
    row = await db.execute(text(sql))
    return int(row.scalar() or 0)


async def check_tenant(slug: str) -> TenantIssues:
    issues = TenantIssues(slug=slug)
    async with AsyncSessionLocal() as db:
        await set_search_path(db, slug)

        for t in REQUIRED_TABLES:
            if not await table_exists(db, t):
                issues.missing_tables.append(t)

        # Skip orphan checks if required parents are missing.
        if not issues.missing_tables:
            issues.orphan_receivable_payments = await count_scalar(
                db,
                "SELECT COUNT(*) FROM crm_receivable_payments p "
                "WHERE NOT EXISTS (SELECT 1 FROM crm_receivables r WHERE r.id = p.receivable_id)",
            )
            issues.orphan_payable_payments = await count_scalar(
                db,
                "SELECT COUNT(*) FROM crm_payable_payments p "
                "WHERE NOT EXISTS (SELECT 1 FROM crm_payables y WHERE y.id = p.payable_id)",
            )
            issues.orphan_receivables = await count_scalar(
                db,
                "SELECT COUNT(*) FROM crm_receivables r "
                "WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = r.contract_id)",
            )
            issues.orphan_payables = await count_scalar(
                db,
                "SELECT COUNT(*) FROM crm_payables p "
                "WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = p.contract_id)",
            )

        await db.rollback()
    return issues


async def main() -> int:
    slugs = await get_tenant_slugs()
    if not slugs:
        print("No provisioned tenants found.")
        return 0

    print(f"Checking {len(slugs)} tenant schemas...")
    has_any_issue = False
    for slug in slugs:
        issues = await check_tenant(slug)
        if not issues.has_issues:
            print(f"[{slug}] ok")
            continue
        has_any_issue = True
        print(f"[{slug}] issues:")
        if issues.missing_tables:
            print(f"  missing_tables={','.join(issues.missing_tables)}")
        if issues.orphan_receivable_payments:
            print(f"  orphan_receivable_payments={issues.orphan_receivable_payments}")
        if issues.orphan_payable_payments:
            print(f"  orphan_payable_payments={issues.orphan_payable_payments}")
        if issues.orphan_receivables:
            print(f"  orphan_receivables={issues.orphan_receivables}")
        if issues.orphan_payables:
            print(f"  orphan_payables={issues.orphan_payables}")

    return 1 if has_any_issue else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
