from datetime import date as date_type, datetime
import json
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.deps import get_current_user_with_tenant
from app.utils.sql import build_update_clause, parse_date

router = APIRouter(prefix="/operations", tags=["operations"])


def month_key(d: date_type | None) -> str | None:
    if not d:
        return None
    return f"{d.year:04d}-{d.month:02d}"


DEFAULT_TASKS = [
    {"code": "factory_inspection", "title": "出厂验货（厂检）", "owner_role": "业务员", "requires_attachment": True},
    {"code": "statutory_inspection", "title": "法检/商检预约与跟进", "owner_role": "单证员", "requires_attachment": True},
    {"code": "packing_details", "title": "催要货物明细并制作分箱明细", "owner_role": "单证员", "requires_attachment": True},
    {"code": "purchase_inbound", "title": "高达采购入库登记", "owner_role": "单证员", "requires_attachment": False},
    {"code": "final_payment_invoice", "title": "付尾款、发票核验与登记", "owner_role": "单证员/出纳员", "requires_attachment": True},
    {"code": "delivery_notice", "title": "送货通知签字并发送供应商", "owner_role": "业务员/单证员", "requires_attachment": True},
    {"code": "godad_billing", "title": "发货当月高达开单", "owner_role": "单证员", "requires_attachment": False},
    {"code": "goods_receipt_confirmation", "title": "确认接货数量与包装质量", "owner_role": "业务员", "requires_attachment": True},
    {"code": "customs_declaration", "title": "报关资料制作与发送货代", "owner_role": "单证员", "requires_attachment": True},
    {"code": "clearance_and_photos", "title": "确认通关并索要装箱/装船照片", "owner_role": "业务员/单证员", "requires_attachment": True},
    {"code": "shipment_notice", "title": "开船后2个工作日内制作装船通知", "owner_role": "单证员", "requires_attachment": True},
    {"code": "docs_preparation", "title": "议付单据与附件制作并发送业务员", "owner_role": "单证员", "requires_attachment": True},
    {"code": "docs_tracking", "title": "交单跟踪登记《TRACKING》", "owner_role": "单证员", "requires_attachment": True},
    {"code": "payment_followup", "title": "回款/LC到款跟进", "owner_role": "业务员/单证员/出纳员", "requires_attachment": True},
    {"code": "eta_reminder", "title": "ETA前7天到港提醒", "owner_role": "业务员", "requires_attachment": False},
    {"code": "satisfaction_survey", "title": "到港15天满意度回访", "owner_role": "业务员/单证员", "requires_attachment": False},
    {"code": "archive_evidence", "title": "电子归档与纸质归档", "owner_role": "业务员/单证员/财务", "requires_attachment": True},
]


class FlowOrderCreate(BaseModel):
    contract_no: str = Field(min_length=2, max_length=120)
    customer_name: Optional[str] = None
    sale_amount_usd: float = 0.0
    sale_amount_cny: float = 0.0
    payment_method: Optional[str] = None
    incoterm: Optional[str] = None
    destination_type: Literal["port", "other_warehouse"] = "port"
    needs_factory_inspection: bool = True
    needs_statutory_inspection: bool = False
    shipping_conditions_met: bool = False
    outstanding_receivable_usd: float = 0.0
    outstanding_receivable_cny: float = 0.0
    tail_payment_date: Optional[str] = None
    delivery_notice_date: Optional[str] = None
    godad_billing_date: Optional[str] = None
    remarks: Optional[str] = None
    initialize_default_tasks: bool = True


class FlowOrderUpdate(BaseModel):
    customer_name: Optional[str] = None
    sale_amount_usd: Optional[float] = None
    sale_amount_cny: Optional[float] = None
    payment_method: Optional[str] = None
    incoterm: Optional[str] = None
    destination_type: Optional[Literal["port", "other_warehouse"]] = None
    needs_factory_inspection: Optional[bool] = None
    needs_statutory_inspection: Optional[bool] = None
    shipping_conditions_met: Optional[bool] = None
    outstanding_receivable_usd: Optional[float] = None
    outstanding_receivable_cny: Optional[float] = None
    tail_payment_date: Optional[str] = None
    delivery_notice_date: Optional[str] = None
    godad_billing_date: Optional[str] = None
    stage: Optional[str] = None
    remarks: Optional[str] = None


class FlowTaskUpdate(BaseModel):
    status: Literal["pending", "in_progress", "blocked", "done"]
    planned_date: Optional[str] = None
    notes: Optional[str] = None
    assignee_name: Optional[str] = None
    owner_role: Optional[str] = None
    metadata: Optional[dict] = None


class FlowDocCreate(BaseModel):
    task_id: Optional[str] = None
    doc_type: str
    file_name: str
    file_url: str
    source: Literal["sales", "doc", "finance", "factory", "forwarder", "other"] = "other"


class RiskCheckRequest(BaseModel):
    action: Literal["delivery_notice", "ship_customs", "release_goods"]


class ApprovalRequestCreate(BaseModel):
    action: Literal["delivery_notice", "ship_customs", "release_goods"]
    required_approver: Optional[str] = None
    reason: Optional[str] = None


class ApprovalDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    decision_notes: Optional[str] = None


async def upsert_flow_link(db, order_id: str, task_id: str, task_code: str, resource_type: str, resource_id: str):
    existing = await db.execute(
        text(
            """
            SELECT id FROM export_flow_links
            WHERE order_id = :order_id AND task_code = :task_code AND resource_type = :resource_type
            LIMIT 1
            """
        ),
        {"order_id": order_id, "task_code": task_code, "resource_type": resource_type},
    )
    if existing.fetchone():
        return
    await db.execute(
        text(
            """
            INSERT INTO export_flow_links (id, order_id, task_id, task_code, resource_type, resource_id)
            VALUES (:id, :order_id, :task_id, :task_code, :resource_type, :resource_id)
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "task_id": task_id,
            "task_code": task_code,
            "resource_type": resource_type,
            "resource_id": resource_id,
        },
    )


async def find_latest_approval(order_id: str, action: str, db):
    result = await db.execute(
        text(
            """
            SELECT id, status, required_approver, requested_at, decided_at
            FROM export_flow_approvals
            WHERE order_id = :order_id AND action = :action
            ORDER BY requested_at DESC
            LIMIT 1
            """
        ),
        {"order_id": order_id, "action": action},
    )
    return result.fetchone()


async def get_order_by_id(db, order_id: str):
    result = await db.execute(text("SELECT * FROM export_flow_orders WHERE id = :id"), {"id": order_id})
    return result.fetchone()


async def apply_module_integrations(order_id: str, task_id: str, task_code: str, ctx: dict):
    db = ctx["db"]
    order = await get_order_by_id(db, order_id)
    if not order:
        return

    if task_code == "purchase_inbound":
        product = await db.execute(text("SELECT id FROM products ORDER BY created_at ASC LIMIT 1"))
        first_product = product.fetchone()
        if first_product:
            movement_id = str(uuid.uuid4())
            await db.execute(
                text(
                    """
                    INSERT INTO stock_movements (
                        id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by
                    ) VALUES (
                        :id, :product_id, 'purchase_inbound', 0, 'operation_order', :reference_id, :notes, :created_by
                    )
                    """
                ),
                {
                    "id": movement_id,
                    "product_id": first_product.id,
                    "reference_id": order_id,
                    "notes": f"[AUTO] Contract {order.contract_no} purchase inbound completed",
                    "created_by": ctx["sub"],
                },
            )
            await upsert_flow_link(db, order_id, task_id, task_code, "inventory_stock_movement", movement_id)

    if task_code == "final_payment_invoice":
        invoice_id = str(uuid.uuid4())
        result = await db.execute(
            text("SELECT COUNT(*) FROM invoices WHERE notes ILIKE :notes AND type = 'payable'"),
            {"notes": f"%{order.contract_no}%"},
        )
        has_existing = (result.scalar() or 0) > 0
        if not has_existing:
            invoice_number = f"AP-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
            await db.execute(
                text(
                    """
                    INSERT INTO invoices (
                        id, invoice_number, type, issue_date, due_date, status,
                        subtotal, tax_rate, tax_amount, total, currency, notes, created_by
                    ) VALUES (
                        :id, :invoice_number, 'payable', :issue_date, :due_date, 'draft',
                        0, 0, 0, 0, 'USD', :notes, :created_by
                    )
                    """
                ),
                {
                    "id": invoice_id,
                    "invoice_number": invoice_number,
                    "issue_date": date_type.today(),
                    "due_date": date_type.today(),
                    "notes": f"[AUTO] Tail payment for contract {order.contract_no}",
                    "created_by": ctx["sub"],
                },
            )
            await upsert_flow_link(db, order_id, task_id, task_code, "accounting_invoice", invoice_id)

    if task_code == "shipment_notice":
        result = await db.execute(
            text("SELECT id FROM shipments WHERE contract_number = :contract_number LIMIT 1"),
            {"contract_number": order.contract_no},
        )
        existing = result.fetchone()
        if existing:
            await db.execute(
                text("UPDATE shipments SET status = 'shipped', updated_at = :updated_at WHERE id = :id"),
                {"id": existing.id, "updated_at": datetime.utcnow()},
            )
            await upsert_flow_link(db, order_id, task_id, task_code, "crm_shipment", str(existing.id))
        else:
            shipment_id = str(uuid.uuid4())
            await db.execute(
                text(
                    """
                    INSERT INTO shipments (id, contract_number, status, etd, created_at, updated_at)
                    VALUES (:id, :contract_number, 'shipped', :etd, :created_at, :updated_at)
                    """
                ),
                {
                    "id": shipment_id,
                    "contract_number": order.contract_no,
                    "etd": date_type.today(),
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                },
            )
            await upsert_flow_link(db, order_id, task_id, task_code, "crm_shipment", shipment_id)


def evaluate_risk_rules(order, action: str) -> list[dict]:
    risk_items: list[dict] = []
    sale_usd = float(order.sale_amount_usd or 0)
    sale_cny = float(order.sale_amount_cny or 0)
    recv_usd = float(order.outstanding_receivable_usd or 0)
    recv_cny = float(order.outstanding_receivable_cny or 0)

    def approver_by_threshold(amount_usd: float, amount_cny: float):
        if amount_usd > 100000 or amount_cny > 700000:
            return "总经理（风控经理上报）"
        return "业务经理"

    if action == "delivery_notice":
        high_delivery_amount = sale_usd > 300000 or sale_cny > 2000000
        need_manager = high_delivery_amount or not order.shipping_conditions_met
        if need_manager:
            reason = []
            if high_delivery_amount:
                reason.append("发货金额超 30 万美金 / 200 万人民币")
            if not order.shipping_conditions_met:
                reason.append("不满足销售合同发货条件")
            risk_items.append(
                {
                    "rule": "delivery_notice_approval",
                    "level": "medium",
                    "required_approver": "业务经理",
                    "reason": "；".join(reason),
                }
            )

    if action == "ship_customs":
        if not order.shipping_conditions_met:
            risk_items.append(
                {
                    "rule": "risk_shipping_customs",
                    "level": "high",
                    "required_approver": approver_by_threshold(sale_usd, sale_cny),
                    "reason": "不满足合同发货前付款/信用证条件，属于风险发货报关",
                }
            )

    if action == "release_goods":
        if recv_usd > 0 or recv_cny > 0:
            risk_items.append(
                {
                    "rule": "risk_release_goods",
                    "level": "high",
                    "required_approver": approver_by_threshold(recv_usd, recv_cny),
                    "reason": "后TT订单仍有应收，客户要求放货，属于风险放货",
                }
            )

    return risk_items


@router.get("/orders")
async def list_orders(limit: int = 50, offset: int = 0, ctx: dict = Depends(get_current_user_with_tenant)):
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    result = await ctx["db"].execute(
        text(
            """
            SELECT id, contract_no, customer_name, sale_amount_usd, sale_amount_cny, payment_method,
                   destination_type, shipping_conditions_met, outstanding_receivable_usd,
                   outstanding_receivable_cny, tail_payment_date, delivery_notice_date,
                   godad_billing_date, stage, created_at
            FROM export_flow_orders
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {"limit": limit, "offset": offset},
    )
    return [dict(r._mapping) for r in result.fetchall()]


@router.post("/orders")
async def create_order(body: FlowOrderCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    order_id = str(uuid.uuid4())
    try:
        await db.execute(
            text(
                """
                INSERT INTO export_flow_orders (
                    id, contract_no, customer_name, sale_amount_usd, sale_amount_cny, payment_method,
                    incoterm, destination_type, needs_factory_inspection, needs_statutory_inspection,
                    shipping_conditions_met, outstanding_receivable_usd, outstanding_receivable_cny,
                    tail_payment_date, delivery_notice_date, godad_billing_date,
                    remarks, created_by
                ) VALUES (
                    :id, :contract_no, :customer_name, :sale_amount_usd, :sale_amount_cny, :payment_method,
                    :incoterm, :destination_type, :needs_factory_inspection, :needs_statutory_inspection,
                    :shipping_conditions_met, :outstanding_receivable_usd, :outstanding_receivable_cny,
                    :tail_payment_date, :delivery_notice_date, :godad_billing_date,
                    :remarks, :created_by
                )
                """
            ),
            {
                "id": order_id,
                "contract_no": body.contract_no,
                "customer_name": body.customer_name,
                "sale_amount_usd": body.sale_amount_usd,
                "sale_amount_cny": body.sale_amount_cny,
                "payment_method": body.payment_method,
                "incoterm": body.incoterm,
                "destination_type": body.destination_type,
                "needs_factory_inspection": body.needs_factory_inspection,
                "needs_statutory_inspection": body.needs_statutory_inspection,
                "shipping_conditions_met": body.shipping_conditions_met,
                "outstanding_receivable_usd": body.outstanding_receivable_usd,
                "outstanding_receivable_cny": body.outstanding_receivable_cny,
                "tail_payment_date": parse_date(body.tail_payment_date),
                "delivery_notice_date": parse_date(body.delivery_notice_date),
                "godad_billing_date": parse_date(body.godad_billing_date),
                "remarks": body.remarks,
                "created_by": ctx["sub"],
            },
        )
        if body.initialize_default_tasks:
            for t in DEFAULT_TASKS:
                await db.execute(
                    text(
                        """
                        INSERT INTO export_flow_tasks (
                            id, order_id, code, title, owner_role, requires_attachment, created_by
                        ) VALUES (:id, :order_id, :code, :title, :owner_role, :requires_attachment, :created_by)
                        """
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "order_id": order_id,
                        "code": t["code"],
                        "title": t["title"],
                        "owner_role": t["owner_role"],
                        "requires_attachment": t["requires_attachment"],
                        "created_by": ctx["sub"],
                    },
                )
        await db.commit()
    except Exception as e:
        await db.rollback()
        if "export_flow_orders_contract_no_key" in str(e):
            raise HTTPException(status_code=409, detail="Contract already exists")
        raise
    return {"id": order_id, "contract_no": body.contract_no}


@router.get("/orders/{order_id}")
async def get_order(order_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(text("SELECT * FROM export_flow_orders WHERE id = :id"), {"id": order_id})
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    tasks_result = await db.execute(
        text("SELECT * FROM export_flow_tasks WHERE order_id = :id ORDER BY created_at, title"),
        {"id": order_id},
    )
    docs_result = await db.execute(
        text("SELECT * FROM export_flow_docs WHERE order_id = :id ORDER BY created_at DESC"),
        {"id": order_id},
    )
    approvals_result = await db.execute(
        text("SELECT * FROM export_flow_approvals WHERE order_id = :id ORDER BY requested_at DESC"),
        {"id": order_id},
    )
    links_result = await db.execute(
        text("SELECT * FROM export_flow_links WHERE order_id = :id ORDER BY created_at DESC"),
        {"id": order_id},
    )
    return {
        **dict(row._mapping),
        "tasks": [dict(t._mapping) for t in tasks_result.fetchall()],
        "docs": [dict(d._mapping) for d in docs_result.fetchall()],
        "approvals": [dict(a._mapping) for a in approvals_result.fetchall()],
        "links": [dict(l._mapping) for l in links_result.fetchall()],
    }


_FLOW_ORDER_UPDATE_FIELDS = {"customer_name", "sale_amount_usd", "sale_amount_cny", "payment_method", "incoterm", "destination_type", "needs_factory_inspection", "needs_statutory_inspection", "shipping_conditions_met", "outstanding_receivable_usd", "outstanding_receivable_cny", "tail_payment_date", "delivery_notice_date", "godad_billing_date", "stage", "remarks"}


@router.patch("/orders/{order_id}")
async def update_order(order_id: str, body: FlowOrderUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "no changes"}
    # Filter to allowed fields only
    updates = {k: v for k, v in updates.items() if k in _FLOW_ORDER_UPDATE_FIELDS}
    if not updates:
        return {"status": "no changes"}
    if "tail_payment_date" in updates:
        updates["tail_payment_date"] = parse_date(updates.get("tail_payment_date"))
    if "delivery_notice_date" in updates:
        updates["delivery_notice_date"] = parse_date(updates.get("delivery_notice_date"))
    if "godad_billing_date" in updates:
        updates["godad_billing_date"] = parse_date(updates.get("godad_billing_date"))

    set_clause = ", ".join([f"{k} = :{k}" for k in updates.keys()])
    updates["id"] = order_id
    updates["updated_at"] = datetime.utcnow()
    set_clause += ", updated_at = :updated_at"
    await ctx["db"].execute(text(f"UPDATE export_flow_orders SET {set_clause} WHERE id = :id"), updates)
    await ctx["db"].commit()
    return {"status": "updated"}


@router.post("/orders/{order_id}/initialize-tasks")
async def initialize_tasks(order_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    existing = await db.execute(text("SELECT COUNT(*) FROM export_flow_tasks WHERE order_id = :id"), {"id": order_id})
    if existing.scalar() > 0:
        raise HTTPException(status_code=409, detail="Tasks already initialized")
    for t in DEFAULT_TASKS:
        await db.execute(
            text(
                """
                INSERT INTO export_flow_tasks (
                    id, order_id, code, title, owner_role, requires_attachment, created_by
                ) VALUES (:id, :order_id, :code, :title, :owner_role, :requires_attachment, :created_by)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "order_id": order_id,
                "code": t["code"],
                "title": t["title"],
                "owner_role": t["owner_role"],
                "requires_attachment": t["requires_attachment"],
                "created_by": ctx["sub"],
            },
        )
    await db.commit()
    return {"status": "initialized", "count": len(DEFAULT_TASKS)}


_FLOW_TASK_UPDATE_FIELDS = {"status", "planned_date", "notes", "assignee_name", "owner_role", "metadata"}


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, body: FlowTaskUpdate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    task_row = await db.execute(
        text("SELECT id, order_id, code, status FROM export_flow_tasks WHERE id = :id"),
        {"id": task_id},
    )
    existing_task = task_row.fetchone()
    if not existing_task:
        raise HTTPException(status_code=404, detail="Task not found")

    payload = body.model_dump(exclude_unset=True)
    payload = {k: v for k, v in payload.items() if k in _FLOW_TASK_UPDATE_FIELDS}
    if "planned_date" in payload:
        payload["planned_date"] = parse_date(payload.get("planned_date"))
    if "metadata" in payload:
        payload["metadata"] = json.dumps(payload["metadata"])
    set_parts = []
    for k in list(payload.keys()):
        if k == "metadata":
            set_parts.append("metadata = CAST(:metadata AS JSONB)")
        else:
            set_parts.append(f"{k} = :{k}")
    if body.status == "done":
        payload["completed_at"] = datetime.utcnow()
        set_parts.append("completed_at = :completed_at")
    payload["updated_by"] = ctx["sub"]
    set_parts.append("updated_by = :updated_by")
    payload["updated_at"] = datetime.utcnow()
    set_parts.append("updated_at = :updated_at")
    payload["id"] = task_id
    await db.execute(text(f"UPDATE export_flow_tasks SET {', '.join(set_parts)} WHERE id = :id"), payload)

    # Bridge modules automatically when key operation tasks are completed.
    if body.status == "done" and existing_task.status != "done":
        await apply_module_integrations(existing_task.order_id, existing_task.id, existing_task.code, ctx)

    await db.commit()
    return {"status": body.status}


@router.post("/orders/{order_id}/documents")
async def add_document(order_id: str, body: FlowDocCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    doc_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text(
            """
            INSERT INTO export_flow_docs (id, order_id, task_id, doc_type, file_name, file_url, source, uploaded_by)
            VALUES (:id, :order_id, :task_id, :doc_type, :file_name, :file_url, :source, :uploaded_by)
            """
        ),
        {
            "id": doc_id,
            "order_id": order_id,
            "task_id": body.task_id,
            "doc_type": body.doc_type,
            "file_name": body.file_name,
            "file_url": body.file_url,
            "source": body.source,
            "uploaded_by": ctx["sub"],
        },
    )
    await ctx["db"].commit()
    return {"id": doc_id}


@router.get("/orders/{order_id}/documents")
async def list_documents(order_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("SELECT * FROM export_flow_docs WHERE order_id = :id ORDER BY created_at DESC"),
        {"id": order_id},
    )
    return [dict(r._mapping) for r in result.fetchall()]


@router.post("/orders/{order_id}/risk-check")
async def risk_check(order_id: str, body: RiskCheckRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(
        text(
            """
            SELECT id, sale_amount_usd, sale_amount_cny, destination_type, shipping_conditions_met,
                   outstanding_receivable_usd, outstanding_receivable_cny
            FROM export_flow_orders
            WHERE id = :id
            """
        ),
        {"id": order_id},
    )
    order = result.fetchone()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    risk_items = evaluate_risk_rules(order, body.action)

    latest_approval = await find_latest_approval(order_id, body.action, db)
    approval_status = latest_approval.status if latest_approval else None
    has_valid_approval = approval_status == "approved"

    blocked_by_rule = len(risk_items) > 0
    blocked_by_approval = blocked_by_rule and not has_valid_approval

    return {
        "order_id": order_id,
        "action": body.action,
        "is_blocked": blocked_by_approval,
        "risk_items": risk_items,
        "approval_status": approval_status,
        "approval_required": blocked_by_rule,
    }


@router.post("/orders/{order_id}/approvals/request")
async def request_approval(order_id: str, body: ApprovalRequestCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(
        text(
            """
            SELECT id, sale_amount_usd, sale_amount_cny, shipping_conditions_met,
                   outstanding_receivable_usd, outstanding_receivable_cny
            FROM export_flow_orders WHERE id = :id
            """
        ),
        {"id": order_id},
    )
    order = result.fetchone()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    rules = evaluate_risk_rules(order, body.action)
    default_approver = rules[0]["required_approver"] if rules else "业务经理"

    approval_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO export_flow_approvals (
                id, order_id, action, required_approver, reason, status, requested_by
            ) VALUES (
                :id, :order_id, :action, :required_approver, :reason, 'pending', :requested_by
            )
            """
        ),
        {
            "id": approval_id,
            "order_id": order_id,
            "action": body.action,
            "required_approver": body.required_approver or default_approver,
            "reason": body.reason or (rules[0]["reason"] if rules else "流程审批申请"),
            "requested_by": ctx["sub"],
        },
    )
    await db.commit()
    return {"id": approval_id, "status": "pending"}


@router.get("/orders/{order_id}/approvals")
async def list_approvals(order_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("SELECT * FROM export_flow_approvals WHERE order_id = :order_id ORDER BY requested_at DESC"),
        {"order_id": order_id},
    )
    return [dict(r._mapping) for r in result.fetchall()]


@router.post("/approvals/{approval_id}/decide")
async def decide_approval(approval_id: str, body: ApprovalDecision, ctx: dict = Depends(get_current_user_with_tenant)):
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
            SET status = :status,
                decision_notes = :decision_notes,
                decided_by = :decided_by,
                decided_at = :decided_at
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


@router.get("/orders/{order_id}/godad-check")
async def godad_check(order_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text(
            """
            SELECT id, payment_method, tail_payment_date, delivery_notice_date, godad_billing_date
            FROM export_flow_orders
            WHERE id = :id
            """
        ),
        {"id": order_id},
    )
    order = result.fetchone()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    payment_method = (order.payment_method or "").strip().upper()
    tail_payment_date = order.tail_payment_date
    delivery_notice_date = order.delivery_notice_date
    godad_billing_date = order.godad_billing_date

    issues: list[str] = []
    guidance: list[str] = []

    post_tt_like = {"POST_TT", "TT_POST", "TT", "DA", "DP", "OA", "LC"}

    if payment_method in {"PRE_TT", "FRONT_TT"}:
        if not tail_payment_date:
            issues.append("前TT订单未登记尾款水单日期，不能判断开单条件。")
        if not godad_billing_date:
            issues.append("未登记高达开单日期。")
        if tail_payment_date and godad_billing_date and month_key(tail_payment_date) != month_key(godad_billing_date):
            issues.append("前TT订单应在尾款水单付款日期当月开单。")
        guidance.append("前TT：见尾款水单后，在水单付款日期当月开单。")
    elif payment_method in post_tt_like:
        if not delivery_notice_date:
            issues.append("后TT/DA/DP/OA/LC订单未登记送货通知日期，不能判断开单条件。")
        if not godad_billing_date:
            issues.append("未登记高达开单日期。")
        if delivery_notice_date and godad_billing_date and month_key(delivery_notice_date) != month_key(godad_billing_date):
            issues.append("后TT/DA/DP/OA/LC订单应在送货通知日期当月开单。")
        guidance.append("后TT/DA/DP/OA/LC：见送货通知后，在送货通知日期当月开单。")
    else:
        issues.append("付款方式未识别，请使用 PRE_TT/FRONT_TT 或 TT/DA/DP/OA/LC。")

    return {
        "order_id": order_id,
        "payment_method": payment_method,
        "is_pass": len(issues) == 0,
        "issues": issues,
        "guidance": guidance,
        "tail_payment_date": tail_payment_date,
        "delivery_notice_date": delivery_notice_date,
        "godad_billing_date": godad_billing_date,
    }
