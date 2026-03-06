"""HR module routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.deps import get_current_user_with_tenant
from app.modules.hr.service import EmployeeService, LeaveRequestService, DepartmentService, PayrollService

router = APIRouter(tags=["hr"])


# ── Employees ──────────────────────────────────────────────────────────────

@router.get("/employees")
async def list_employees(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    department_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = EmployeeService(ctx["db"])
    filters = {}
    if department_id:
        filters["department_id"] = department_id
    if status:
        filters["status"] = status
    return await svc.list(
        page=page, size=size, filters=filters,
        search=search, search_fields=["full_name", "email", "employee_number"],
    )


@router.get("/employees/{employee_id}")
async def get_employee(employee_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = EmployeeService(ctx["db"])
    emp = await svc.get_with_details(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


@router.post("/employees")
async def create_employee(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = EmployeeService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


@router.patch("/employees/{employee_id}")
async def update_employee(employee_id: str, body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = EmployeeService(ctx["db"])
    record = await svc.update(employee_id, body, user_id=ctx["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Employee not found")
    await ctx["db"].commit()
    return record


# ── Leave Requests ─────────────────────────────────────────────────────────

@router.get("/leave-requests")
async def list_leave_requests(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    svc = LeaveRequestService(ctx["db"])
    filters = {}
    if employee_id:
        filters["employee_id"] = employee_id
    if status:
        filters["status"] = status
    return await svc.list(page=page, size=size, filters=filters)


@router.post("/leave-requests")
async def create_leave_request(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = LeaveRequestService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record


@router.post("/leave-requests/{request_id}/approve")
async def approve_leave(request_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = LeaveRequestService(ctx["db"])
    record = await svc.approve(request_id, user_id=ctx["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Request not found or already processed")
    await ctx["db"].commit()
    return record


@router.post("/leave-requests/{request_id}/reject")
async def reject_leave(request_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = LeaveRequestService(ctx["db"])
    record = await svc.reject(request_id, user_id=ctx["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Request not found or already processed")
    await ctx["db"].commit()
    return record


# ── Departments ────────────────────────────────────────────────────────────

@router.get("/departments")
async def list_departments(ctx: dict = Depends(get_current_user_with_tenant)):
    svc = DepartmentService(ctx["db"])
    return await svc.list(size=200, sort_field="name", sort_order="asc")


@router.post("/departments")
async def create_department(body: dict, ctx: dict = Depends(get_current_user_with_tenant)):
    svc = DepartmentService(ctx["db"])
    record = await svc.create(body, user_id=ctx["sub"])
    await ctx["db"].commit()
    return record
