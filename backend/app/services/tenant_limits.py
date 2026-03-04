from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def ensure_tenant_user_capacity(
    db: AsyncSession,
    tenant_slug: str,
    *,
    additional_active_users: int = 1,
) -> None:
    """Raise 409 if adding users would exceed tenant active-user limit.

    `user_limit` is stored in platform.tenants:
    - NULL means unlimited.
    - Positive integer means max number of active users.
    """
    row = await db.execute(
        text("SELECT user_limit FROM platform.tenants WHERE slug = :slug"),
        {"slug": tenant_slug},
    )
    tenant = row.fetchone()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    limit = tenant.user_limit
    if limit is None:
        return
    if limit <= 0:
        raise HTTPException(status_code=409, detail="Tenant user limit is 0")

    count_row = await db.execute(text("SELECT COUNT(*) AS c FROM users WHERE COALESCE(is_active, TRUE) = TRUE"))
    active_users = int(count_row.scalar() or 0)
    if active_users + additional_active_users > int(limit):
        raise HTTPException(
            status_code=409,
            detail=f"Tenant user limit reached ({active_users}/{limit})",
        )

