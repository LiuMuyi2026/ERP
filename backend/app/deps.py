from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import settings
from app.database import AsyncSessionLocal
from app.utils.sql import safe_set_search_path

security = HTTPBearer()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            try:
                await session.rollback()
                await session.execute(text("SET search_path TO public"))
            except Exception:
                pass


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    return {
        "sub": payload.get("sub"),
        "role": payload.get("role"),
        "tenant_id": payload.get("tenant_id"),
        "tenant_slug": payload.get("tenant_slug"),
        "permissions": payload.get("permissions", []),
    }


async def get_current_user_with_tenant(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_token(credentials.credentials)
    tenant_slug = payload.get("tenant_slug")
    if tenant_slug:
        tenant = await db.execute(
            text("SELECT is_active, schema_provisioned FROM platform.tenants WHERE slug = :slug"),
            {"slug": tenant_slug},
        )
        tenant_row = tenant.fetchone()
        if not tenant_row:
            raise HTTPException(status_code=401, detail="Tenant not found")
        if not tenant_row.is_active:
            raise HTTPException(status_code=403, detail="Tenant is disabled")
        if not tenant_row.schema_provisioned:
            raise HTTPException(status_code=503, detail="Tenant is not provisioned yet")
        await safe_set_search_path(db, tenant_slug)
    return {
        "sub": payload.get("sub"),
        "role": payload.get("role"),
        "tenant_id": payload.get("tenant_id"),
        "tenant_slug": tenant_slug,
        "permissions": payload.get("permissions", []),
        "db": db,
    }


async def require_admin_with_tenant(
    ctx: dict = Depends(get_current_user_with_tenant),
):
    role = ctx.get("role", "")
    if role in ("platform_admin", "tenant_admin"):
        return ctx
    row = await ctx["db"].execute(text("SELECT is_admin FROM users WHERE id = :id"), {"id": ctx["sub"]})
    user_row = row.fetchone()
    if user_row and user_row.is_admin:
        return ctx
    raise HTTPException(status_code=403, detail="Tenant admin access required")


def require_platform_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "platform_admin":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    return current_user


def require_tenant_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("platform_admin", "tenant_admin"):
        raise HTTPException(status_code=403, detail="Tenant admin access required")
    return current_user
