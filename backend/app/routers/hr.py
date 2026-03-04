from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, field_validator
from typing import Optional
from app.deps import get_current_user_with_tenant
from app.services.auth import get_password_hash
from app.services.tenant_limits import ensure_tenant_user_capacity
from app.utils.sql import build_update_clause, parse_date
import uuid

router = APIRouter(prefix="/hr", tags=["hr"])


async def _next_employee_number(db) -> str:
    row = await db.execute(
        text(
            """
            SELECT COALESCE(
                MAX(NULLIF(regexp_replace(COALESCE(employee_number, ''), '[^0-9]', '', 'g'), '')::int),
                0
            )
            FROM employees
            """
        )
    )
    next_no = int(row.scalar() or 0) + 1
    return f"EMP{next_no:04d}"


class EmployeeCreate(BaseModel):
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    manager_id: Optional[str] = None
    title: Optional[str] = None
    employment_type: str = "full_time"
    start_date: Optional[str] = None
    salary: Optional[float] = None
    currency: str = "USD"


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    manager_id: Optional[str] = None
    title: Optional[str] = None
    employment_type: Optional[str] = None
    start_date: Optional[str] = None
    salary: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None

    @field_validator("salary", "start_date", mode="before")
    @classmethod
    def coerce_empty_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v


class LeaveRequestCreate(BaseModel):
    employee_id: str
    leave_type: str
    start_date: str
    end_date: str
    days: float
    reason: Optional[str] = None


class MyLeaveRequestCreate(BaseModel):
    leave_type: str
    start_date: str
    end_date: str
    days: float
    reason: Optional[str] = None


class RejectBody(BaseModel):
    reason: Optional[str] = None


@router.get("/employees")
async def list_employees(department_id: Optional[str] = None, search: Optional[str] = None, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # Silently auto-link employees → users by matching email
    await db.execute(text("""
        UPDATE employees e
        SET user_id = u.id
        FROM users u
        WHERE e.email = u.email AND e.user_id IS NULL
    """))
    # Auto-create employee records for users that have none
    await db.execute(text("""
        WITH base AS (
            SELECT COALESCE(
                MAX(NULLIF(regexp_replace(COALESCE(employee_number, ''), '[^0-9]', '', 'g'), '')::int),
                0
            ) AS max_no
            FROM employees
        ),
        pending AS (
            SELECT
                u.id,
                u.created_at,
                COALESCE(NULLIF(u.full_name, ''), SPLIT_PART(u.email, '@', 1), 'User') AS full_name,
                u.email
            FROM users u
            WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)
        )
        INSERT INTO employees (id, user_id, employee_number, full_name, email)
        SELECT
            gen_random_uuid(),
            p.id,
            'EMP' || LPAD((b.max_no + ROW_NUMBER() OVER (ORDER BY p.created_at, p.id))::text, 4, '0'),
            p.full_name,
            p.email
        FROM pending p
        CROSS JOIN base b
        ON CONFLICT (employee_number) DO NOTHING
    """))
    await db.commit()

    conditions = ["e.status != 'terminated'"]
    params: dict = {}
    if department_id:
        conditions.append("e.department_id = :dept")
        params["dept"] = department_id
    if search:
        conditions.append("(e.full_name ILIKE :search OR e.email ILIKE :search)")
        params["search"] = f"%{search}%"
    where = " AND ".join(conditions)
    result = await db.execute(text(f"""
        SELECT e.*, d.name AS department_name, p.name AS position_name
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        WHERE {where}
        ORDER BY e.full_name
    """), params)
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/employees")
async def create_employee(body: EmployeeCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    emp_id = str(uuid.uuid4())
    emp_number = await _next_employee_number(db)
    # Auto-link user_id if email matches an existing user
    user_id = None
    if body.email:
        ur = await db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": body.email})
        urow = ur.fetchone()
        if urow:
            user_id = str(urow.id)
    await db.execute(
        text("""INSERT INTO employees
               (id, user_id, employee_number, full_name, email, phone, department_id, position_id,
                manager_id, title, employment_type, start_date, salary, currency)
               VALUES (:id, :uid, :emp_num, :name, :email, :phone, :dept, :position,
                       :manager, :title, :type, :start, :salary, :currency)"""),
        {"id": emp_id, "uid": user_id, "emp_num": emp_number, "name": body.full_name, "email": body.email,
         "phone": body.phone, "dept": body.department_id, "position": body.position_id,
         "manager": body.manager_id, "title": body.title, "type": body.employment_type,
         "start": parse_date(body.start_date), "salary": body.salary, "currency": body.currency}
    )
    await db.commit()
    return {"id": emp_id, "employee_number": emp_number}


@router.get("/employees/{emp_id}")
async def get_employee(emp_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(text("""
        SELECT e.*, d.name AS department_name, p.name AS position_name
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        WHERE e.id = :id
    """), {"id": emp_id})
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Employee not found")
    return dict(row._mapping)


_UUID_FIELDS = {"department_id", "position_id", "manager_id"}
_EMP_UPDATE_FIELDS = {"full_name", "email", "phone", "department_id", "position_id", "manager_id", "title", "employment_type", "start_date", "salary", "currency", "status"}

@router.patch("/employees/{emp_id}")
async def update_employee(emp_id: str, body: EmployeeUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    # exclude_unset: only update fields explicitly sent by client
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no changes"}
    parts, params = [], {"id": emp_id}
    for k, v in updates.items():
        if k not in _EMP_UPDATE_FIELDS:
            continue
        parts.append(f"{k} = :{k}")
        if k == "start_date":
            params[k] = parse_date(v)
        elif k in _UUID_FIELDS:
            # empty string → NULL so PostgreSQL UUID column doesn't reject it
            params[k] = v if v else None
        else:
            params[k] = v
    parts.append("updated_at = NOW()")
    await ctx["db"].execute(text(f"UPDATE employees SET {', '.join(parts)} WHERE id = :id"), params)
    await ctx["db"].commit()
    return {"status": "ok"}


@router.get("/departments")
async def list_departments(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(text("SELECT * FROM departments ORDER BY name"))
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/departments")
async def create_department(name: str, parent_id: Optional[str] = None, ctx: dict = Depends(get_current_user_with_tenant)):
    dept_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text("INSERT INTO departments (id, name, parent_id) VALUES (:id, :name, :parent)"),
        {"id": dept_id, "name": name, "parent": parent_id}
    )
    await ctx["db"].commit()
    return {"id": dept_id, "name": name}


@router.patch("/departments/{dept_id}")
async def update_department(dept_id: str, name: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(text("UPDATE departments SET name = :name WHERE id = :id"), {"name": name, "id": dept_id})
    await ctx["db"].commit()
    return {"status": "ok"}


@router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(text("UPDATE employees SET department_id = NULL WHERE department_id = :id"), {"id": dept_id})
    await ctx["db"].execute(text("DELETE FROM departments WHERE id = :id"), {"id": dept_id})
    await ctx["db"].commit()
    return {"status": "deleted"}


@router.get("/leave-requests")
async def list_leave_requests(employee_id: Optional[str] = None, status: Optional[str] = None, ctx: dict = Depends(get_current_user_with_tenant)):
    conditions = ["1=1"]
    params: dict = {}
    if employee_id:
        conditions.append("lr.employee_id = :emp")
        params["emp"] = employee_id
    if status:
        conditions.append("lr.status = :status")
        params["status"] = status
    where = " AND ".join(conditions)
    result = await ctx["db"].execute(text(f"""
        SELECT lr.*, e.full_name AS employee_name, u.full_name AS approver_name
        FROM leave_requests lr
        LEFT JOIN employees e ON e.id = lr.employee_id
        LEFT JOIN users u ON u.id = lr.approved_by
        WHERE {where}
        ORDER BY lr.created_at DESC
    """), params)
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/leave-requests")
async def create_leave_request(body: LeaveRequestCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    req_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text("INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason) VALUES (:id, :emp, :type, :start, :end, :days, :reason)"),
        {"id": req_id, "emp": body.employee_id, "type": body.leave_type, "start": parse_date(body.start_date),
         "end": parse_date(body.end_date), "days": body.days, "reason": body.reason}
    )
    await ctx["db"].commit()
    return {"id": req_id}


@router.get("/my-leave-requests")
async def list_my_leave_requests(ctx: dict = Depends(get_current_user_with_tenant)):
    """Return leave requests for the currently logged-in user (matched via employees.user_id)."""
    db = ctx["db"]
    result = await db.execute(text("""
        SELECT lr.*, e.full_name AS employee_name, u.full_name AS approver_name
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id AND e.user_id = :uid
        LEFT JOIN users u ON u.id = lr.approved_by
        ORDER BY lr.created_at DESC
    """), {"uid": ctx["sub"]})
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/my-leave-requests")
async def create_my_leave_request(body: MyLeaveRequestCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    """Self-service leave creation — derives employee_id from the logged-in user."""
    db = ctx["db"]
    emp_result = await db.execute(text("SELECT id FROM employees WHERE user_id = :uid"), {"uid": ctx["sub"]})
    emp_row = emp_result.fetchone()
    if not emp_row:
        raise HTTPException(status_code=404, detail="No linked employee record found for your account")
    req_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason) VALUES (:id, :emp, :type, :start, :end, :days, :reason)"),
        {"id": req_id, "emp": emp_row.id, "type": body.leave_type, "start": parse_date(body.start_date),
         "end": parse_date(body.end_date), "days": body.days, "reason": body.reason}
    )
    await db.commit()
    return {"id": req_id}


@router.patch("/leave-requests/{req_id}/approve")
async def approve_leave(req_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Only admins can approve leave requests")
    await ctx["db"].execute(
        text("UPDATE leave_requests SET status = 'approved', approved_by = :approver WHERE id = :id"),
        {"approver": ctx["sub"], "id": req_id}
    )
    await ctx["db"].commit()
    return {"status": "approved"}


@router.patch("/leave-requests/{req_id}/reject")
async def reject_leave(req_id: str, body: Optional[RejectBody] = None, ctx: dict = Depends(get_current_user_with_tenant)):
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Only admins can reject leave requests")
    reason = body.reason if body else None
    await ctx["db"].execute(
        text("UPDATE leave_requests SET status = 'rejected', approved_by = :approver, reject_reason = :reason WHERE id = :id"),
        {"approver": ctx["sub"], "id": req_id, "reason": reason}
    )
    await ctx["db"].commit()
    return {"status": "rejected"}


# ── Unified Staff (users + employees merged) ──────────────────────────────────

class StaffCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "tenant_user"
    phone: Optional[str] = None
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    title: Optional[str] = None
    employment_type: str = "full_time"
    start_date: Optional[str] = None


class StaffUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    title: Optional[str] = None
    employment_type: Optional[str] = None


_USER_FIELDS = {"full_name", "role", "is_admin", "is_active"}
_EMP_FIELDS = {"phone", "department_id", "position_id", "title", "employment_type"}
_EMP_UUID_FIELDS = {"department_id", "position_id"}


@router.post("/staff/link-by-email")
async def link_employees_by_email(ctx: dict = Depends(get_current_user_with_tenant)):
    """Auto-link employees to user accounts where emails match (one-time migration helper)."""
    db = ctx["db"]
    result = await db.execute(text("""
        UPDATE employees e
        SET user_id = u.id
        FROM users u
        WHERE e.email = u.email
          AND e.user_id IS NULL
        RETURNING e.id
    """))
    linked = len(result.fetchall())
    await db.commit()
    return {"linked": linked}


@router.get("/staff")
async def list_staff(ctx: dict = Depends(get_current_user_with_tenant)):
    """Return all users with their linked employee profile merged into one row.
    Also silently auto-links any employees whose email matches a user account."""
    db = ctx["db"]
    # Silently auto-link employees → users by matching email
    await db.execute(text("""
        UPDATE employees e
        SET user_id = u.id
        FROM users u
        WHERE e.email = u.email AND e.user_id IS NULL
    """))
    await db.commit()
    result = await db.execute(text("""
        SELECT
            u.id               AS user_id,
            u.email,
            u.full_name        AS user_name,
            u.role,
            u.is_active,
            u.is_admin,
            u.created_at       AS user_created_at,
            e.id               AS employee_id,
            e.employee_number,
            e.full_name        AS employee_name,
            e.phone,
            e.department_id,
            d.name             AS department_name,
            e.position_id,
            p.name             AS position_name,
            e.title,
            e.employment_type,
            e.start_date,
            e.status           AS employee_status
        FROM users u
        LEFT JOIN employees e ON e.user_id = u.id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        ORDER BY COALESCE(e.full_name, u.full_name, u.email)
    """))
    rows = []
    for row in result.fetchall():
        d = dict(row._mapping)
        d["full_name"] = d["employee_name"] or d["user_name"] or (d["email"] or "").split("@")[0]
        rows.append(d)
    return rows


@router.post("/staff")
async def create_staff(body: StaffCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    """Create a user account and employee record atomically."""
    db = ctx["db"]
    await ensure_tenant_user_capacity(db, ctx["tenant_slug"])
    user_id = str(uuid.uuid4())
    hashed = get_password_hash(body.password)

    try:
        await db.execute(
            text("INSERT INTO users (id, email, hashed_password, full_name, role) VALUES (:id, :email, :pw, :name, :role)"),
            {"id": user_id, "email": body.email, "pw": hashed, "name": body.full_name, "role": body.role}
        )
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="邮箱已被使用")

    emp_number = await _next_employee_number(db)
    emp_id = str(uuid.uuid4())
    await db.execute(
        text("""INSERT INTO employees
               (id, user_id, employee_number, full_name, email, phone, department_id, position_id,
                title, employment_type, start_date)
               VALUES (:id, :uid, :num, :name, :email, :phone, :dept, :pos, :title, :type, :start)"""),
        {
            "id": emp_id, "uid": user_id, "num": emp_number,
            "name": body.full_name, "email": body.email, "phone": body.phone,
            "dept": body.department_id or None, "pos": body.position_id or None,
            "title": body.title, "type": body.employment_type,
            "start": parse_date(body.start_date),
        }
    )
    await db.commit()
    return {"user_id": user_id, "employee_id": emp_id, "employee_number": emp_number}


@router.patch("/staff/{user_id}")
async def update_staff(user_id: str, body: StaffUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    """Update user account and/or employee profile fields."""
    db = ctx["db"]
    updates = body.model_dump(exclude_unset=True)

    user_upd = {k: v for k, v in updates.items() if k in _USER_FIELDS}
    emp_upd = {k: v for k, v in updates.items() if k in _EMP_FIELDS}

    if user_upd:
        set_clause, safe_params = build_update_clause(user_upd, _USER_FIELDS)
        if set_clause:
            safe_params["_id"] = user_id
            await db.execute(
                text(f"UPDATE users SET {set_clause}, updated_at = NOW() WHERE id = :_id"),
                safe_params
            )

    if emp_upd:
        # Coerce empty strings to NULL for UUID columns
        for k in _EMP_UUID_FIELDS:
            if k in emp_upd and not emp_upd[k]:
                emp_upd[k] = None

        r = await db.execute(text("SELECT id FROM employees WHERE user_id = :uid"), {"uid": user_id})
        existing_emp = r.fetchone()
        if existing_emp:
            set_clause, safe_params = build_update_clause(emp_upd, _EMP_FIELDS)
            if set_clause:
                safe_params["_uid"] = user_id
                await db.execute(
                    text(f"UPDATE employees SET {set_clause}, updated_at = NOW() WHERE user_id = :_uid"),
                    safe_params
                )
        else:
            # Create a new employee record linked to the user
            ur = await db.execute(text("SELECT full_name, email FROM users WHERE id = :id"), {"id": user_id})
            urow = ur.fetchone()
            new_emp_id = str(uuid.uuid4())
            # Ensure all INSERT columns have a value (some may not be in the patch)
            for field in ("phone", "department_id", "position_id", "title", "employment_type"):
                emp_upd.setdefault(field, None)
            emp_upd.update({
                "_eid": new_emp_id, "_uid": user_id,
                "_num": await _next_employee_number(db),
                "_name": urow.full_name or "", "_email": urow.email or "",
            })
            await db.execute(
                text("""INSERT INTO employees (id, user_id, employee_number, full_name, email,
                                              phone, department_id, position_id, title, employment_type)
                         VALUES (:_eid, :_uid, :_num, :_name, :_email,
                                 :phone, :department_id, :position_id, :title, :employment_type)"""),
                emp_upd
            )

    await db.commit()
    return {"status": "ok"}


@router.get("/staff/{user_id}/leads")
async def get_staff_leads(user_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Return all CRM leads assigned to (or created by) this user, with status & timestamps."""
    result = await ctx["db"].execute(text("""
        SELECT
            l.id, l.full_name, l.company, l.status, l.is_cold,
            l.follow_up_status, l.country, l.contract_value, l.currency,
            l.created_at, l.updated_at
        FROM leads l
        WHERE l.assigned_to = :uid
        ORDER BY l.updated_at DESC NULLS LAST
    """), {"uid": user_id})
    return [dict(r._mapping) for r in result.fetchall()]
