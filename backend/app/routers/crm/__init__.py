"""
CRM Business Management — combined router.

Imports and re-exports sub-routers for: analytics, leads, contracts,
receivables, payables, workflow, approvals, todos, files, communications.

Usage:
    from app.routers.crm import router
"""

from fastapi import APIRouter

from app.routers.crm.analytics import router as analytics_router
from app.routers.crm.leads import router as leads_router
from app.routers.crm.contracts import router as contracts_router
from app.routers.crm.receivables import router as receivables_router
from app.routers.crm.payables import router as payables_router
from app.routers.crm.workflow import router as workflow_router
from app.routers.crm.approvals import router as approvals_router
from app.routers.crm.todos import router as todos_router
from app.routers.crm.files import router as files_router
from app.routers.crm.communications import router as communications_router

router = APIRouter()

router.include_router(analytics_router)
router.include_router(leads_router)
router.include_router(contracts_router)
router.include_router(receivables_router)
router.include_router(payables_router)
router.include_router(workflow_router)
router.include_router(approvals_router)
router.include_router(todos_router)
router.include_router(files_router)
router.include_router(communications_router)
