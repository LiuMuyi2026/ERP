"""HR module service layer."""

import logging
from sqlalchemy import text
from app.core.base_service import BaseService
from app.core.events import events

logger = logging.getLogger(__name__)


class EmployeeService(BaseService):
    table_name = "employees"
    entity_type = "employee"
    module_name = "hr"
    display_name_field = "full_name"
    phone_field = "phone"
    email_field = "email"

    allowed_fields = {
        "employee_number", "full_name", "email", "phone",
        "department_id", "position_id", "employment_type", "status",
        "start_date", "end_date", "gender", "birthday",
        "address", "emergency_contact", "emergency_phone",
        "salary", "bank_account", "notes",
    }
    date_fields = {"start_date", "end_date", "birthday"}

    async def get_with_details(self, employee_id: str) -> dict | None:
        emp = await self.get(employee_id)
        if not emp:
            return None
        # Fetch department name
        if emp.get("department_id"):
            dept = await self.db.execute(
                text("SELECT name FROM departments WHERE id = :id"),
                {"id": emp["department_id"]},
            )
            dept_row = dept.fetchone()
            emp["department_name"] = dept_row.name if dept_row else None
        # Fetch leave balance
        leaves = await self.db.execute(
            text("""
                SELECT leave_type, SUM(days) as total_days
                FROM leave_requests
                WHERE employee_id = :eid AND status = 'approved'
                    AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM NOW())
                GROUP BY leave_type
            """),
            {"eid": employee_id},
        )
        emp["leave_taken"] = {r.leave_type: float(r.total_days) for r in leaves.fetchall()}
        return emp


class LeaveRequestService(BaseService):
    table_name = "leave_requests"
    entity_type = ""
    module_name = "hr"

    allowed_fields = {
        "employee_id", "leave_type", "start_date", "end_date",
        "days", "status", "reason", "approved_by",
    }
    date_fields = {"start_date", "end_date"}

    async def approve(self, request_id: str, *, user_id: str | None = None) -> dict | None:
        row = await self.db.execute(
            text("""
                UPDATE leave_requests SET status = 'approved', approved_by = :uid, updated_at = NOW()
                WHERE id = :id AND status = 'pending'
                RETURNING *
            """),
            {"id": request_id, "uid": user_id},
        )
        result = row.fetchone()
        if result:
            record = dict(result._mapping)
            await events.emit("hr.leave_request.approved", {"record": record, "user_id": user_id})
            return record
        return None

    async def reject(self, request_id: str, *, user_id: str | None = None) -> dict | None:
        row = await self.db.execute(
            text("""
                UPDATE leave_requests SET status = 'rejected', approved_by = :uid, updated_at = NOW()
                WHERE id = :id AND status = 'pending'
                RETURNING *
            """),
            {"id": request_id, "uid": user_id},
        )
        result = row.fetchone()
        return dict(result._mapping) if result else None


class DepartmentService(BaseService):
    table_name = "departments"
    entity_type = ""
    module_name = "hr"
    display_name_field = "name"

    allowed_fields = {"name", "parent_id", "manager_id", "description"}


class PayrollService(BaseService):
    table_name = "payroll_runs"
    entity_type = ""
    module_name = "hr"

    allowed_fields = {
        "period_start", "period_end", "status", "total_amount",
        "employee_count", "notes",
    }
    date_fields = {"period_start", "period_end"}
