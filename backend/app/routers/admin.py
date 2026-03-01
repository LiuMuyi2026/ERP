import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, EmailStr
from typing import Optional, List

from app.deps import get_current_user_with_tenant, require_admin_with_tenant
from app.services.auth import get_password_hash
from app.utils.sql import build_update_clause

_PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$")
DEFAULT_PASSWORD = "Happy2026"

router = APIRouter(prefix="/admin", tags=["admin"])

APPS = ["workspace", "crm", "hr", "accounting", "inventory", "operations"]
APP_LABELS = {
    "workspace": "工作台", "crm": "客户管理", "hr": "人事管理",
    "accounting": "财务管理", "inventory": "库存管理", "operations": "出口流程",
}


# ── Pydantic models ───────────────────────────────────────────────────────────

class InviteUser(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "tenant_user"
    password: str

class UpdateTenantSettings(BaseModel):
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    currency: Optional[str] = None
    locale: Optional[str] = None


class NotificationSmtpConfig(BaseModel):
    email_enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    smtp_use_ssl: Optional[bool] = None
    smtp_timeout_seconds: Optional[int] = None

class PositionCreate(BaseModel):
    name: str
    description: Optional[str] = None

class PositionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class AppPermissionItem(BaseModel):
    app: str
    target_type: str   # 'position' | 'department' | 'user'
    target_id: str
    permission: str    # 'edit' | 'view' | 'none'

class BulkPermissionUpdate(BaseModel):
    permissions: List[AppPermissionItem]


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(text("""
        SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.is_admin, u.created_at,
               u.plain_password, u.avatar_url,
               p.name AS position_name
        FROM users u
        LEFT JOIN employees e ON e.user_id = u.id
        LEFT JOIN positions p ON p.id = e.position_id
        ORDER BY u.created_at
    """))
    rows = []
    for row in result.fetchall():
        d = dict(row._mapping)
        if d.get("is_admin") and not d.get("full_name"):
            d["full_name"] = d.get("email", "").split("@")[0] + " (管理员)"
        rows.append(d)
    return rows


@router.post("/users/invite")
async def invite_user(body: InviteUser, ctx: dict = Depends(get_current_user_with_tenant)):
    # Permission check: only tenant_admin / platform_admin / is_admin can invite
    caller_role = ctx.get("role", "")
    if caller_role not in ("tenant_admin", "platform_admin"):
        row = await ctx["db"].execute(text("SELECT is_admin FROM users WHERE id = :id"), {"id": ctx["sub"]})
        r = row.fetchone()
        if not r or not r.is_admin:
            raise HTTPException(status_code=403, detail="Admin rights required to invite users")

    # Role restriction: cannot invite tenant_admin or platform_admin
    allowed_roles = {"tenant_user", "manager"}
    if body.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Role must be one of {allowed_roles}")

    # Use default password if none provided
    plain_pw = body.password.strip() if body.password.strip() else DEFAULT_PASSWORD

    user_id = str(uuid.uuid4())
    hashed = get_password_hash(plain_pw)
    await ctx["db"].execute(
        text("INSERT INTO users (id, email, hashed_password, plain_password, full_name, role) VALUES (:id, :email, :pw, :plain, :name, :role)"),
        {"id": user_id, "email": body.email, "pw": hashed, "plain": plain_pw, "name": body.full_name, "role": body.role}
    )
    await ctx["db"].commit()
    return {"id": user_id, "email": body.email}


@router.patch("/users/{user_id}/promote")
async def promote_user(user_id: str, is_admin: bool, ctx: dict = Depends(get_current_user_with_tenant)):
    """Grant or revoke admin rights for a user. Only callable by tenant_admin or is_admin users."""
    caller_role = ctx.get("role", "")
    if caller_role not in ("tenant_admin", "platform_admin"):
        # Check if caller has is_admin flag
        row = await ctx["db"].execute(text("SELECT is_admin FROM users WHERE id = :id"), {"id": ctx["sub"]})
        r = row.fetchone()
        if not r or not r.is_admin:
            raise HTTPException(status_code=403, detail="Admin rights required")

    # Verify target user exists in current tenant schema
    target = await ctx["db"].execute(text("SELECT id FROM users WHERE id = :id"), {"id": user_id})
    if not target.fetchone():
        raise HTTPException(status_code=404, detail="User not found")

    await ctx["db"].execute(
        text("UPDATE users SET is_admin = :flag WHERE id = :id"),
        {"flag": is_admin, "id": user_id}
    )
    await ctx["db"].commit()
    return {"status": "ok", "is_admin": is_admin}


@router.patch("/users/{user_id}/role")
async def change_user_role(user_id: str, role: str, ctx: dict = Depends(get_current_user_with_tenant)):
    # Permission check
    caller_role = ctx.get("role", "")
    if caller_role not in ("tenant_admin", "platform_admin"):
        row = await ctx["db"].execute(text("SELECT is_admin FROM users WHERE id = :id"), {"id": ctx["sub"]})
        r = row.fetchone()
        if not r or not r.is_admin:
            raise HTTPException(status_code=403, detail="Admin rights required")

    allowed = {"tenant_admin", "tenant_user", "manager"}
    if role not in allowed:
        raise HTTPException(status_code=400, detail=f"Role must be one of {allowed}")

    # Verify target user exists in current tenant schema
    target = await ctx["db"].execute(text("SELECT id FROM users WHERE id = :id"), {"id": user_id})
    if not target.fetchone():
        raise HTTPException(status_code=404, detail="User not found")

    await ctx["db"].execute(text("UPDATE users SET role = :role WHERE id = :id"), {"role": role, "id": user_id})
    await ctx["db"].commit()
    return {"status": "ok"}


class ResetPassword(BaseModel):
    new_password: Optional[str] = None  # If empty, uses DEFAULT_PASSWORD


@router.patch("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, body: ResetPassword, ctx: dict = Depends(get_current_user_with_tenant)):
    """Reset a user's password. Only callable by tenant_admin or is_admin users."""
    caller_role = ctx.get("role", "")
    if caller_role not in ("tenant_admin", "platform_admin"):
        row = await ctx["db"].execute(text("SELECT is_admin FROM users WHERE id = :id"), {"id": ctx["sub"]})
        r = row.fetchone()
        if not r or not r.is_admin:
            raise HTTPException(status_code=403, detail="Admin rights required")

    target = await ctx["db"].execute(text("SELECT id FROM users WHERE id = :id"), {"id": user_id})
    if not target.fetchone():
        raise HTTPException(status_code=404, detail="User not found")

    plain_pw = (body.new_password or "").strip() or DEFAULT_PASSWORD
    hashed = get_password_hash(plain_pw)
    await ctx["db"].execute(
        text("UPDATE users SET hashed_password = :pw, plain_password = :plain WHERE id = :id"),
        {"pw": hashed, "plain": plain_pw, "id": user_id}
    )
    await ctx["db"].commit()
    return {"status": "ok", "plain_password": plain_pw}


# ── Positions (职务) ──────────────────────────────────────────────────────────

@router.get("/positions")
async def list_positions(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(text("SELECT * FROM positions ORDER BY sort_order, name"))
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/positions")
async def create_position(body: PositionCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    pos_id = str(uuid.uuid4())
    try:
        await ctx["db"].execute(
            text("INSERT INTO positions (id, name, description, is_builtin) VALUES (:id, :name, :desc, FALSE)"),
            {"id": pos_id, "name": body.name, "desc": body.description}
        )
        await ctx["db"].commit()
    except IntegrityError:
        await ctx["db"].rollback()
        raise HTTPException(status_code=409, detail="职务名称已存在")
    return {"id": pos_id, "name": body.name}


@router.patch("/positions/{pos_id}")
async def update_position(pos_id: str, body: PositionUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    row = await ctx["db"].execute(text("SELECT id FROM positions WHERE id = :id"), {"id": pos_id})
    r = row.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="职务不存在")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no changes"}
    _POS_FIELDS = {"name", "description"}
    set_clause, params = build_update_clause(updates, _POS_FIELDS)
    if not set_clause:
        return {"status": "no changes"}
    params["id"] = pos_id

    await ctx["db"].execute(text(f"UPDATE positions SET {set_clause} WHERE id = :id"), params)
    await ctx["db"].commit()
    return {"status": "ok"}


@router.delete("/positions/{pos_id}")
async def delete_position(pos_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    row = await ctx["db"].execute(text("SELECT id FROM positions WHERE id = :id"), {"id": pos_id})
    r = row.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="职务不存在")

    # Use SAVEPOINT for atomicity
    db = ctx["db"]
    await db.execute(text("SAVEPOINT sp_del_pos"))
    try:
        await db.execute(text("UPDATE employees SET position_id = NULL WHERE position_id = :id"), {"id": pos_id})
        await db.execute(text("DELETE FROM app_permissions WHERE target_type='position' AND target_id = CAST(:id AS uuid)"), {"id": pos_id})
        await db.execute(text("DELETE FROM positions WHERE id = :id"), {"id": pos_id})
        await db.commit()
    except Exception:
        await db.execute(text("ROLLBACK TO SAVEPOINT sp_del_pos"))
        raise
    return {"status": "deleted"}


# ── App Permissions ───────────────────────────────────────────────────────────

@router.get("/app-permissions")
async def get_app_permissions(ctx: dict = Depends(get_current_user_with_tenant)):
    """Return all permission rules + app metadata."""
    result = await ctx["db"].execute(text("SELECT * FROM app_permissions ORDER BY app, target_type"))
    rows = [dict(r._mapping) for r in result.fetchall()]
    return {"apps": APPS, "app_labels": APP_LABELS, "permissions": rows}


@router.patch("/app-permissions")
async def update_app_permissions(body: BulkPermissionUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    """Upsert a batch of permission rules."""
    db = ctx["db"]
    for item in body.permissions:
        if item.app not in APPS:
            continue
        if item.permission not in ("edit", "view", "none"):
            continue
        if item.permission == "view":
            # 'view' is default — delete the explicit rule if it exists
            await db.execute(
                text("DELETE FROM app_permissions WHERE app=:app AND target_type=:tt AND target_id=CAST(:tid AS uuid)"),
                {"app": item.app, "tt": item.target_type, "tid": item.target_id}
            )
        else:
            await db.execute(
                text("""INSERT INTO app_permissions (id, app, target_type, target_id, permission, updated_at)
                         VALUES (gen_random_uuid(), :app, :tt, CAST(:tid AS uuid), :perm, NOW())
                         ON CONFLICT (app, target_type, target_id)
                         DO UPDATE SET permission=EXCLUDED.permission, updated_at=NOW()"""),
                {"app": item.app, "tt": item.target_type, "tid": item.target_id, "perm": item.permission}
            )
    await db.commit()
    return {"status": "ok"}


@router.get("/my-permissions")
async def get_my_permissions(ctx: dict = Depends(get_current_user_with_tenant)):
    """
    Compute effective app permissions for the calling user.
    Priority: user-level > position-level > department-level > default (view).
    tenant_admin / is_admin → edit all.
    """
    db = ctx["db"]
    user_id = ctx["sub"]
    role = ctx.get("role", "tenant_user")

    if role in ("tenant_admin", "platform_admin"):
        return {app: "edit" for app in APPS}

    # Check is_admin flag
    r = await db.execute(text("SELECT is_admin, id FROM users WHERE id = :id"), {"id": user_id})
    user_row = r.fetchone()
    if user_row and user_row.is_admin:
        return {app: "edit" for app in APPS}

    # Get employee's position_id and department_id
    emp = await db.execute(
        text("SELECT position_id, department_id FROM employees WHERE user_id = :uid"),
        {"uid": user_id}
    )
    emp_row = emp.fetchone()
    position_id = str(emp_row.position_id) if emp_row and emp_row.position_id else None
    department_id = str(emp_row.department_id) if emp_row and emp_row.department_id else None

    # Fetch only relevant permission rules via SQL WHERE filter
    target_ids = [user_id]
    conditions = ["(target_type = 'user' AND target_id = CAST(:uid AS uuid))"]
    perm_params: dict = {"uid": user_id}
    if department_id:
        conditions.append("(target_type = 'department' AND target_id = CAST(:dept AS uuid))")
        perm_params["dept"] = department_id
    if position_id:
        conditions.append("(target_type = 'position' AND target_id = CAST(:pos AS uuid))")
        perm_params["pos"] = position_id

    where_clause = " OR ".join(conditions)
    perms_result = await db.execute(
        text(f"SELECT app, target_type, permission FROM app_permissions WHERE {where_clause}"),
        perm_params,
    )
    all_perms = perms_result.fetchall()

    # Index by (app, target_type) for O(1) lookup
    perm_map: dict[tuple[str, str], str] = {}
    for row in all_perms:
        perm_map[(row.app, row.target_type)] = row.permission

    effective: dict[str, str] = {}
    for app in APPS:
        p = "view"  # default
        if department_id and (app, "department") in perm_map:
            p = perm_map[(app, "department")]
        if position_id and (app, "position") in perm_map:
            p = perm_map[(app, "position")]
        if (app, "user") in perm_map:
            p = perm_map[(app, "user")]
        effective[app] = p

    return effective


# ── Audit logs ────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
async def list_audit_logs(resource_type: Optional[str] = None, limit: int = 100, ctx: dict = Depends(get_current_user_with_tenant)):
    params: dict = {"limit": limit}
    where = "1=1"
    if resource_type:
        where = "resource_type = :res"
        params["res"] = resource_type
    result = await ctx["db"].execute(text(f"SELECT * FROM audit_logs WHERE {where} ORDER BY created_at DESC LIMIT :limit"), params)
    return [dict(row._mapping) for row in result.fetchall()]


# ── Tenant settings ───────────────────────────────────────────────────────────

@router.get("/settings")
async def get_tenant_settings(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("SELECT id, name, slug, logo_url, primary_color, currency, locale, crm_enabled, hr_enabled, accounting_enabled, inventory_enabled FROM platform.tenants WHERE slug = :slug"),
        {"slug": ctx["tenant_slug"]}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return dict(row._mapping)


@router.patch("/settings")
async def update_tenant_settings(body: UpdateTenantSettings, ctx: dict = Depends(get_current_user_with_tenant)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"status": "no changes"}
    _TENANT_SETTINGS_FIELDS = {"logo_url", "primary_color", "currency", "locale"}
    set_clause, params = build_update_clause(updates, _TENANT_SETTINGS_FIELDS)
    if not set_clause:
        return {"status": "no changes"}
    params["slug"] = ctx["tenant_slug"]
    await ctx["db"].execute(text(f"UPDATE platform.tenants SET {set_clause} WHERE slug = :slug"), params)
    await ctx["db"].commit()
    return {"status": "updated"}


@router.get("/notifications/smtp")
async def get_notifications_smtp(ctx: dict = Depends(require_admin_with_tenant)):
    result = await ctx["db"].execute(
        text("""
            SELECT email_enabled, smtp_host, smtp_port, smtp_username,
                   smtp_from_email, smtp_from_name, smtp_use_tls, smtp_use_ssl,
                   smtp_timeout_seconds
            FROM platform.tenants
            WHERE slug = :slug
        """),
        {"slug": ctx["tenant_slug"]},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "email_enabled": bool(row.email_enabled),
        "smtp_host": row.smtp_host or "",
        "smtp_port": row.smtp_port or 587,
        "smtp_username": row.smtp_username or "",
        "smtp_from_email": row.smtp_from_email or "",
        "smtp_from_name": row.smtp_from_name or "Nexus ERP",
        "smtp_use_tls": bool(row.smtp_use_tls),
        "smtp_use_ssl": bool(row.smtp_use_ssl),
        "smtp_timeout_seconds": row.smtp_timeout_seconds or 20,
    }


@router.patch("/notifications/smtp")
async def update_notifications_smtp(body: NotificationSmtpConfig, ctx: dict = Depends(require_admin_with_tenant)):
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not updates:
        return {"status": "no changes"}
    allowed_fields = {
        "email_enabled", "smtp_host", "smtp_port", "smtp_username", "smtp_password",
        "smtp_from_email", "smtp_from_name", "smtp_use_tls", "smtp_use_ssl", "smtp_timeout_seconds",
    }
    set_clause, params = build_update_clause(updates, allowed_fields)
    if not set_clause:
        return {"status": "no changes"}
    params["slug"] = ctx["tenant_slug"]
    await ctx["db"].execute(text(f"UPDATE platform.tenants SET {set_clause}, updated_at = NOW() WHERE slug = :slug"), params)
    await ctx["db"].commit()
    return {"status": "updated"}
