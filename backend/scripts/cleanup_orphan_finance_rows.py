#!/usr/bin/env python3
"""
Audit and optionally clean orphan finance rows across tenant schemas.

Usage:
  cd backend
  python scripts/cleanup_orphan_finance_rows.py           # audit only
  python scripts/cleanup_orphan_finance_rows.py --apply   # delete orphans
"""

import argparse
import asyncio
from dataclasses import dataclass

from sqlalchemy import text

from app.database import AsyncSessionLocal


@dataclass
class OrphanStats:
    receivable_payments: int = 0
    payable_payments: int = 0
    receivables: int = 0
    payables: int = 0

    @property
    def total(self) -> int:
        return self.receivable_payments + self.payable_payments + self.receivables + self.payables


async def get_tenant_slugs() -> list[str]:
    async with AsyncSessionLocal() as db:
        rows = await db.execute(text("SELECT slug FROM platform.tenants WHERE schema_provisioned = TRUE ORDER BY slug"))
        return [r[0] for r in rows.fetchall()]


async def set_search_path(db, slug: str) -> None:
    await db.execute(text(f'SET search_path TO "tenant_{slug}", public'))


async def collect_stats(db) -> OrphanStats:
    stats = OrphanStats()
    stats.receivable_payments = int((await db.execute(text(
        "SELECT COUNT(*) FROM crm_receivable_payments p "
        "WHERE NOT EXISTS (SELECT 1 FROM crm_receivables r WHERE r.id = p.receivable_id)"
    ))).scalar() or 0)
    stats.payable_payments = int((await db.execute(text(
        "SELECT COUNT(*) FROM crm_payable_payments p "
        "WHERE NOT EXISTS (SELECT 1 FROM crm_payables y WHERE y.id = p.payable_id)"
    ))).scalar() or 0)
    stats.receivables = int((await db.execute(text(
        "SELECT COUNT(*) FROM crm_receivables r "
        "WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = r.contract_id)"
    ))).scalar() or 0)
    stats.payables = int((await db.execute(text(
        "SELECT COUNT(*) FROM crm_payables p "
        "WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = p.contract_id)"
    ))).scalar() or 0)
    return stats


async def cleanup_orphans(db) -> None:
    await db.execute(text(
        "DELETE FROM crm_receivable_payments p "
        "WHERE NOT EXISTS (SELECT 1 FROM crm_receivables r WHERE r.id = p.receivable_id)"
    ))
    await db.execute(text(
        "DELETE FROM crm_payable_payments p "
        "WHERE NOT EXISTS (SELECT 1 FROM crm_payables y WHERE y.id = p.payable_id)"
    ))
    await db.execute(text(
        "DELETE FROM crm_receivables r "
        "WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = r.contract_id)"
    ))
    await db.execute(text(
        "DELETE FROM crm_payables p "
        "WHERE NOT EXISTS (SELECT 1 FROM crm_contracts c WHERE c.id = p.contract_id)"
    ))


async def main(apply_changes: bool) -> int:
    slugs = await get_tenant_slugs()
    if not slugs:
        print("No provisioned tenants found.")
        return 0

    total_deleted = 0
    print(f"Scanning {len(slugs)} tenant schemas...")
    for slug in slugs:
        async with AsyncSessionLocal() as db:
            await set_search_path(db, slug)
            before = await collect_stats(db)
            if before.total == 0:
                print(f"[{slug}] clean")
                continue

            print(
                f"[{slug}] receivable_payments={before.receivable_payments}, "
                f"payable_payments={before.payable_payments}, "
                f"receivables={before.receivables}, payables={before.payables}"
            )

            if apply_changes:
                await cleanup_orphans(db)
                await db.commit()
                total_deleted += before.total
                print(f"[{slug}] deleted {before.total} orphan rows")
            else:
                await db.rollback()

    if apply_changes:
        print(f"Done. Total deleted rows: {total_deleted}")
    else:
        print("Audit only. Re-run with --apply to delete orphan rows.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Delete orphan rows instead of audit-only")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.apply)))
