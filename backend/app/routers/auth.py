import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.deps import get_db, get_current_user_with_tenant
from app.services.auth import verify_password, verify_password_async, get_password_hash, get_password_hash_async, create_token_for_platform_admin, create_token_for_tenant_user
from app.utils.sql import safe_set_search_path

_PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$")

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()


class LoginRequest(BaseModel):
    email: str
    password: str
    tenant_slug: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    tenant_slug: str | None = None


class RegisterPlatformAdmin(BaseModel):
    email: str
    password: str
    full_name: str | None = None


@router.get("/bootstrap-status")
async def bootstrap_status(db: AsyncSession = Depends(get_db)):
    admin_count = (await db.execute(text("SELECT COUNT(*) FROM platform.platform_admins"))).scalar() or 0
    tenant_count = (await db.execute(text("SELECT COUNT(*) FROM platform.tenants"))).scalar() or 0
    return {
        "has_platform_admin": admin_count > 0,
        "platform_admin_count": admin_count,
        "tenant_count": tenant_count,
    }


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    if not body.tenant_slug:
        result = await db.execute(
            text("SELECT id, email, hashed_password, is_active FROM platform.platform_admins WHERE email = :email"),
            {"email": body.email}
        )
        admin = result.fetchone()
        if not admin or not await verify_password_async(body.password, admin.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not admin.is_active:
            raise HTTPException(status_code=403, detail="Account disabled")
        token = create_token_for_platform_admin(str(admin.id), admin.email)
        return TokenResponse(access_token=token, role="platform_admin")
    else:
        tenant_result = await db.execute(
            text("SELECT id, is_active, schema_provisioned FROM platform.tenants WHERE LOWER(slug) = LOWER(:slug)"),
            {"slug": body.tenant_slug}
        )
        tenant = tenant_result.fetchone()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        if not tenant.is_active:
            raise HTTPException(status_code=403, detail="Tenant is disabled")
        if not tenant.schema_provisioned:
            raise HTTPException(status_code=503, detail="Tenant is not provisioned yet")

        slug_lower = body.tenant_slug.strip().lower()
        await safe_set_search_path(db, slug_lower)
        result = await db.execute(
            text("SELECT id, email, hashed_password, role, is_active, permissions, full_name, avatar_url FROM users WHERE LOWER(email) = LOWER(:email)"),
            {"email": body.email.strip()}
        )
        user = result.fetchone()
        if not user or not await verify_password_async(body.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account disabled")
        token = create_token_for_tenant_user(
            str(user.id), user.email, user.role, str(tenant.id),
            slug_lower, user.permissions or [], full_name=user.full_name, avatar_url=user.avatar_url
        )
        return TokenResponse(access_token=token, role=user.role, tenant_slug=slug_lower)


@router.post("/register-platform-admin", response_model=TokenResponse)
async def register_platform_admin(body: RegisterPlatformAdmin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT COUNT(*) FROM platform.platform_admins"))
    if result.scalar() > 0:
        raise HTTPException(status_code=403, detail="Platform admin already exists")
    admin_id = str(uuid.uuid4())
    hashed = await get_password_hash_async(body.password)
    await db.execute(
        text("INSERT INTO platform.platform_admins (id, email, hashed_password, full_name) VALUES (:id, :email, :pw, :name)"),
        {"id": admin_id, "email": body.email, "pw": hashed, "name": body.full_name}
    )
    await db.commit()
    token = create_token_for_platform_admin(admin_id, body.email)
    return TokenResponse(access_token=token, role="platform_admin")


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    """Change the current user's password. Requires the old password to be correct."""
    if not _PASSWORD_RE.match(body.new_password):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters with uppercase, lowercase, and a digit",
        )

    db = ctx["db"]
    user_id = ctx["sub"]

    result = await db.execute(
        text("SELECT hashed_password FROM users WHERE id = :id"),
        {"id": user_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    if not await verify_password_async(body.old_password, row.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = await get_password_hash_async(body.new_password)
    await db.execute(
        text("UPDATE users SET hashed_password = :pw WHERE id = :id"),
        {"pw": new_hash, "id": user_id}
    )
    await db.commit()
    return {"message": "Password changed successfully"}


@router.get("/me")
async def get_me(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]
    result = await db.execute(
        text("SELECT email, full_name, avatar_url FROM users WHERE id = :id"),
        {"id": user_id},
    )
    row = result.fetchone()
    return {
        "id": user_id,
        "email": row.email if row else None,
        "role": ctx.get("role"),
        "tenant_id": ctx.get("tenant_id"),
        "tenant_slug": ctx.get("tenant_slug"),
        "permissions": ctx.get("permissions", []),
        "full_name": row.full_name if row else None,
        "avatar_url": row.avatar_url if row else None,
    }


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    avatar_url: str | None = None


@router.put("/profile")
async def update_profile(body: ProfileUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    """Update the current user's profile (name, avatar)."""
    db = ctx["db"]
    user_id = ctx["sub"]
    updates = []
    params: dict = {"id": user_id}
    if body.full_name is not None:
        updates.append("full_name = :full_name")
        params["full_name"] = body.full_name
    if body.avatar_url is not None:
        updates.append("avatar_url = :avatar_url")
        params["avatar_url"] = body.avatar_url
    if not updates:
        return {"message": "No changes"}
    await db.execute(
        text(f"UPDATE users SET {', '.join(updates)}, updated_at = NOW() WHERE id = :id"),
        params,
    )
    await db.commit()
    return {"message": "Profile updated"}
