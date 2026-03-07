"""
CRM Risks & Approvals.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant

from app.routers.crm_shared import ApprovalDecision

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Risks & Approvals
# ---------------------------------------------------------------------------

@router.get("/risks/pending-approvals")
async def pending_approvals(ctx: dict = Depends(get_current_user_with_tenant)):
    rows = await ctx["db"].execute(
        text(
            """
            SELECT ap.*, COALESCE(o.contract_no, '') AS contract_no
            FROM export_flow_approvals ap
            LEFT JOIN export_flow_orders o ON o.id = ap.order_id
            WHERE ap.status = 'pending'
            ORDER BY ap.requested_at DESC
            """
        )
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/risks/approvals/{approval_id}/decide")
async def decide_approval(approval_id: str, body: ApprovalDecision, ctx: dict = Depends(get_current_user_with_tenant)):
    if ctx.get("role") not in ("tenant_admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="Tenant admin access required")
    result = await ctx["db"].execute(
        text("SELECT id, status FROM export_flow_approvals WHERE id = :id"),
        {"id": approval_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Approval not found")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="Approval already decided")
    await ctx["db"].execute(
        text(
            """
            UPDATE export_flow_approvals
            SET status = :status, decision_notes = :decision_notes,
                decided_by = :decided_by, decided_at = :decided_at
            WHERE id = :id
            """
        ),
        {
            "id": approval_id,
            "status": body.decision,
            "decision_notes": body.decision_notes,
            "decided_by": ctx["sub"],
            "decided_at": datetime.utcnow(),
        },
    )
    await ctx["db"].commit()
    return {"status": body.decision}
