"""
Module Definitions API — manages customizable business page definitions.

Inspired by Frappe DocType JSON + Odoo ir.model.fields patterns.
Each module_definition stores a JSONB `fields` array describing every field
for a business entity (lead, employee, invoice, etc.), plus view settings.
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from typing import Optional

from app.deps import get_current_user_with_tenant, require_admin_with_tenant

router = APIRouter(prefix="/module-defs", tags=["module-defs"])


# ── Pydantic models ──────────────────────────────────────────────────────────

class FieldDef(BaseModel):
    fieldname: str
    fieldtype: str  # Data, Int, Float, Currency, Select, Link, Check, Date, Datetime, Text, TextEditor, Attach, Section Break, Column Break, Tab Break
    label: str = ""
    options: str = ""  # Select: newline-delimited choices. Link: target doctype. Data: Email/Phone/URL
    reqd: bool = False
    hidden: bool = False
    read_only: bool = False
    in_list_view: bool = False
    in_standard_filter: bool = False
    default: str = ""
    description: str = ""
    width: str = ""
    sort_order: int = 0


class ModuleDefUpdate(BaseModel):
    label: Optional[str] = None
    label_plural: Optional[str] = None
    icon: Optional[str] = None
    fields: Optional[list] = None
    list_settings: Optional[dict] = None
    form_settings: Optional[dict] = None
    dashboard_settings: Optional[dict] = None
    workflow_settings: Optional[dict] = None
    is_active: Optional[bool] = None


# ── Seed data: default field definitions for each module ─────────────────────

SEED_MODULE_DEFS = [
    # ── CRM: Lead ──
    {
        "module": "crm", "doctype": "lead",
        "label": "线索", "label_plural": "线索管理",
        "icon": "people-group", "table_name": "leads",
        "fields": [
            {"fieldname": "full_name", "fieldtype": "Data", "label": "姓名", "reqd": True, "in_list_view": True},
            {"fieldname": "company", "fieldtype": "Data", "label": "公司", "in_list_view": True},
            {"fieldname": "email", "fieldtype": "Data", "label": "邮箱", "options": "Email", "in_list_view": True},
            {"fieldname": "phone", "fieldtype": "Data", "label": "电话", "options": "Phone"},
            {"fieldname": "whatsapp", "fieldtype": "Data", "label": "WhatsApp", "options": "Phone"},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "status", "fieldtype": "Select", "label": "状态",
             "options": "inquiry\nreplied\nqualified\nquoted\nnegotiating\nprocuring\nbooking\nfulfillment\npayment\nconverted\ncold\nlost",
             "reqd": True, "in_list_view": True, "in_standard_filter": True, "default": "inquiry"},
            {"fieldname": "source", "fieldtype": "Select", "label": "来源",
             "options": "website\nreferral\ncold_call\nemail\nsocial_media\nother",
             "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "assigned_to", "fieldtype": "Link", "label": "负责人", "options": "User", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "section_break_details", "fieldtype": "Section Break", "label": "详细信息"},
            {"fieldname": "familiarity_stage", "fieldtype": "Select", "label": "熟悉度",
             "options": "stranger\nacquaintance\nfamiliar\ntrusted"},
            {"fieldname": "wechat", "fieldtype": "Data", "label": "微信"},
            {"fieldname": "address", "fieldtype": "Data", "label": "地址"},
            {"fieldname": "section_break_notes", "fieldtype": "Section Break", "label": "备注"},
            {"fieldname": "notes", "fieldtype": "Text", "label": "备注"},
        ],
        "list_settings": {"sort_field": "created_at", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "full_name"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {
                "inquiry": "blue", "replied": "cyan", "qualified": "green",
                "quoted": "yellow", "negotiating": "orange", "procuring": "purple",
                "booking": "indigo", "fulfillment": "teal", "payment": "amber",
                "converted": "emerald", "cold": "gray", "lost": "red"
            }
        },
    },
    # ── CRM: Contract ──
    {
        "module": "crm", "doctype": "contract",
        "label": "合同", "label_plural": "合同管理",
        "icon": "scroll", "table_name": "crm_contracts",
        "fields": [
            {"fieldname": "contract_no", "fieldtype": "Data", "label": "合同编号", "reqd": True, "in_list_view": True},
            {"fieldname": "title", "fieldtype": "Data", "label": "合同标题", "reqd": True, "in_list_view": True},
            {"fieldname": "lead_id", "fieldtype": "Link", "label": "关联客户", "options": "Lead", "in_list_view": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "amount", "fieldtype": "Currency", "label": "金额", "reqd": True, "in_list_view": True},
            {"fieldname": "currency", "fieldtype": "Select", "label": "币种", "options": "CNY\nUSD\nEUR\nGBP", "default": "CNY"},
            {"fieldname": "status", "fieldtype": "Select", "label": "状态",
             "options": "draft\nactive\ncompleted\ncancelled",
             "reqd": True, "in_list_view": True, "in_standard_filter": True, "default": "draft"},
            {"fieldname": "risk_level", "fieldtype": "Select", "label": "风险等级",
             "options": "low\nmedium\nhigh", "default": "low", "in_standard_filter": True},
            {"fieldname": "section_break_dates", "fieldtype": "Section Break", "label": "日期"},
            {"fieldname": "sign_date", "fieldtype": "Date", "label": "签约日期"},
            {"fieldname": "start_date", "fieldtype": "Date", "label": "开始日期"},
            {"fieldname": "end_date", "fieldtype": "Date", "label": "结束日期"},
            {"fieldname": "section_break_notes", "fieldtype": "Section Break", "label": "备注"},
            {"fieldname": "notes", "fieldtype": "Text", "label": "备注"},
        ],
        "list_settings": {"sort_field": "created_at", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "title"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"draft": "gray", "active": "green", "completed": "blue", "cancelled": "red"}
        },
    },
    # ── CRM: Receivable ──
    {
        "module": "crm", "doctype": "receivable",
        "label": "应收款", "label_plural": "应收管理",
        "icon": "money-bag", "table_name": "crm_receivables",
        "fields": [
            {"fieldname": "contract_id", "fieldtype": "Link", "label": "关联合同", "options": "Contract", "in_list_view": True},
            {"fieldname": "amount", "fieldtype": "Currency", "label": "应收金额", "reqd": True, "in_list_view": True},
            {"fieldname": "received_amount", "fieldtype": "Currency", "label": "已收金额", "in_list_view": True, "read_only": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "状态",
             "options": "pending\npartial\npaid\noverdue",
             "in_list_view": True, "in_standard_filter": True, "default": "pending"},
            {"fieldname": "due_date", "fieldtype": "Date", "label": "到期日", "in_list_view": True},
            {"fieldname": "description", "fieldtype": "Text", "label": "说明"},
        ],
        "list_settings": {"sort_field": "due_date", "sort_order": "asc", "page_size": 50},
        "form_settings": {"title_field": "contract_id"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"pending": "yellow", "partial": "orange", "paid": "green", "overdue": "red"}
        },
    },
    # ── HR: Employee ──
    {
        "module": "hr", "doctype": "employee",
        "label": "员工", "label_plural": "员工管理",
        "icon": "necktie", "table_name": "employees",
        "fields": [
            {"fieldname": "employee_number", "fieldtype": "Data", "label": "工号", "in_list_view": True},
            {"fieldname": "full_name", "fieldtype": "Data", "label": "姓名", "reqd": True, "in_list_view": True},
            {"fieldname": "email", "fieldtype": "Data", "label": "邮箱", "options": "Email", "in_list_view": True},
            {"fieldname": "phone", "fieldtype": "Data", "label": "电话", "options": "Phone"},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "department_id", "fieldtype": "Link", "label": "部门", "options": "Department", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "position_id", "fieldtype": "Link", "label": "职位", "options": "Position", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "employment_type", "fieldtype": "Select", "label": "雇佣类型",
             "options": "full_time\npart_time\ncontract\nintern",
             "default": "full_time", "in_standard_filter": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "状态",
             "options": "active\non_leave\nresigned\nterminated",
             "default": "active", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "section_break_dates", "fieldtype": "Section Break", "label": "入职信息"},
            {"fieldname": "start_date", "fieldtype": "Date", "label": "入职日期"},
            {"fieldname": "end_date", "fieldtype": "Date", "label": "离职日期"},
            {"fieldname": "section_break_personal", "fieldtype": "Section Break", "label": "个人信息"},
            {"fieldname": "gender", "fieldtype": "Select", "label": "性别", "options": "male\nfemale\nother"},
            {"fieldname": "birthday", "fieldtype": "Date", "label": "生日"},
            {"fieldname": "address", "fieldtype": "Data", "label": "地址"},
            {"fieldname": "emergency_contact", "fieldtype": "Data", "label": "紧急联系人"},
            {"fieldname": "emergency_phone", "fieldtype": "Data", "label": "紧急联系电话", "options": "Phone"},
        ],
        "list_settings": {"sort_field": "employee_number", "sort_order": "asc", "page_size": 50},
        "form_settings": {"title_field": "full_name"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"active": "green", "on_leave": "yellow", "resigned": "gray", "terminated": "red"}
        },
    },
    # ── HR: Leave Request ──
    {
        "module": "hr", "doctype": "leave_request",
        "label": "请假", "label_plural": "请假管理",
        "icon": "calendar", "table_name": "leave_requests",
        "fields": [
            {"fieldname": "employee_id", "fieldtype": "Link", "label": "员工", "options": "Employee", "reqd": True, "in_list_view": True},
            {"fieldname": "leave_type", "fieldtype": "Select", "label": "假期类型",
             "options": "annual\nsick\npersonal\nmaternity\npaternity\nother",
             "reqd": True, "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "start_date", "fieldtype": "Date", "label": "开始日期", "reqd": True, "in_list_view": True},
            {"fieldname": "end_date", "fieldtype": "Date", "label": "结束日期", "reqd": True, "in_list_view": True},
            {"fieldname": "days", "fieldtype": "Float", "label": "天数", "in_list_view": True, "read_only": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "审批状态",
             "options": "pending\napproved\nrejected",
             "default": "pending", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "section_break_reason", "fieldtype": "Section Break", "label": "原因"},
            {"fieldname": "reason", "fieldtype": "Text", "label": "请假原因"},
        ],
        "list_settings": {"sort_field": "created_at", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "employee_id"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"pending": "yellow", "approved": "green", "rejected": "red"}
        },
    },
    # ── Accounting: Invoice ──
    {
        "module": "accounting", "doctype": "invoice",
        "label": "发票", "label_plural": "发票管理",
        "icon": "receipt", "table_name": "invoices",
        "fields": [
            {"fieldname": "invoice_number", "fieldtype": "Data", "label": "发票号", "in_list_view": True},
            {"fieldname": "contact_name", "fieldtype": "Data", "label": "客户名称", "in_list_view": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "issue_date", "fieldtype": "Date", "label": "开票日期", "reqd": True, "in_list_view": True},
            {"fieldname": "due_date", "fieldtype": "Date", "label": "到期日期", "in_list_view": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "状态",
             "options": "draft\nsent\npartial\npaid\noverdue",
             "default": "draft", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "section_break_amounts", "fieldtype": "Section Break", "label": "金额"},
            {"fieldname": "subtotal", "fieldtype": "Currency", "label": "小计"},
            {"fieldname": "tax_amount", "fieldtype": "Currency", "label": "税额"},
            {"fieldname": "total_amount", "fieldtype": "Currency", "label": "总额", "in_list_view": True},
            {"fieldname": "section_break_notes", "fieldtype": "Section Break", "label": "备注"},
            {"fieldname": "notes", "fieldtype": "Text", "label": "备注"},
        ],
        "list_settings": {"sort_field": "issue_date", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "invoice_number"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"draft": "gray", "sent": "blue", "partial": "orange", "paid": "green", "overdue": "red"}
        },
    },
    # ── Accounting: Journal Entry ──
    {
        "module": "accounting", "doctype": "journal_entry",
        "label": "记账凭证", "label_plural": "记账凭证",
        "icon": "ledger", "table_name": "journal_entries",
        "fields": [
            {"fieldname": "entry_date", "fieldtype": "Date", "label": "日期", "reqd": True, "in_list_view": True},
            {"fieldname": "description", "fieldtype": "Data", "label": "摘要", "reqd": True, "in_list_view": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "total_debit", "fieldtype": "Currency", "label": "借方合计", "in_list_view": True, "read_only": True},
            {"fieldname": "total_credit", "fieldtype": "Currency", "label": "贷方合计", "in_list_view": True, "read_only": True},
            {"fieldname": "status", "fieldtype": "Select", "label": "状态",
             "options": "draft\nposted\ncancelled",
             "default": "draft", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "section_break_lines", "fieldtype": "Section Break", "label": "分录行"},
            {"fieldname": "lines", "fieldtype": "JSON", "label": "分录明细", "description": "借贷方明细行"},
        ],
        "list_settings": {"sort_field": "entry_date", "sort_order": "desc", "page_size": 50},
        "form_settings": {"title_field": "description"},
        "workflow_settings": {
            "status_field": "status",
            "status_colors": {"draft": "gray", "posted": "green", "cancelled": "red"}
        },
    },
    # ── Inventory: Product ──
    {
        "module": "inventory", "doctype": "product",
        "label": "产品", "label_plural": "产品管理",
        "icon": "package", "table_name": "products",
        "fields": [
            {"fieldname": "sku", "fieldtype": "Data", "label": "SKU", "reqd": True, "in_list_view": True},
            {"fieldname": "name", "fieldtype": "Data", "label": "产品名称", "reqd": True, "in_list_view": True},
            {"fieldname": "category", "fieldtype": "Data", "label": "分类", "in_list_view": True, "in_standard_filter": True},
            {"fieldname": "column_break_1", "fieldtype": "Column Break", "label": ""},
            {"fieldname": "unit", "fieldtype": "Data", "label": "单位", "default": "件"},
            {"fieldname": "cost_price", "fieldtype": "Currency", "label": "成本价"},
            {"fieldname": "sell_price", "fieldtype": "Currency", "label": "售价", "in_list_view": True},
            {"fieldname": "stock_qty", "fieldtype": "Int", "label": "库存数量", "in_list_view": True},
            {"fieldname": "reorder_point", "fieldtype": "Int", "label": "最低库存", "default": "0"},
            {"fieldname": "section_break_desc", "fieldtype": "Section Break", "label": "描述"},
            {"fieldname": "description", "fieldtype": "Text", "label": "产品描述"},
        ],
        "list_settings": {"sort_field": "name", "sort_order": "asc", "page_size": 50},
        "form_settings": {"title_field": "name"},
        "workflow_settings": {},
    },
]


# ── Helper: seed defaults if table is empty ──────────────────────────────────

async def _seed_defaults(db):
    """Insert default module definitions if none exist."""
    row = await db.execute(text("SELECT COUNT(*) FROM module_definitions"))
    count = row.scalar()
    if count > 0:
        return
    for i, seed in enumerate(SEED_MODULE_DEFS):
        await db.execute(text("""
            INSERT INTO module_definitions (module, doctype, label, label_plural, icon, table_name,
                fields, list_settings, form_settings, dashboard_settings, workflow_settings, sort_order)
            VALUES (:module, :doctype, :label, :label_plural, :icon, :table_name,
                CAST(:fields AS JSONB), CAST(:list_settings AS JSONB),
                CAST(:form_settings AS JSONB), CAST(:dashboard_settings AS JSONB),
                CAST(:workflow_settings AS JSONB), :sort_order)
            ON CONFLICT (module, doctype) DO NOTHING
        """), {
            "module": seed["module"],
            "doctype": seed["doctype"],
            "label": seed.get("label", seed["doctype"]),
            "label_plural": seed.get("label_plural", ""),
            "icon": seed.get("icon", ""),
            "table_name": seed.get("table_name", ""),
            "fields": json.dumps(seed.get("fields", []), ensure_ascii=False),
            "list_settings": json.dumps(seed.get("list_settings", {}), ensure_ascii=False),
            "form_settings": json.dumps(seed.get("form_settings", {}), ensure_ascii=False),
            "dashboard_settings": json.dumps(seed.get("dashboard_settings", {}), ensure_ascii=False),
            "workflow_settings": json.dumps(seed.get("workflow_settings", {}), ensure_ascii=False),
            "sort_order": i,
        })
    await db.commit()


# ── Routes ────────────────────────────────────────────────────────────────────
# NOTE: Fixed-path routes MUST come before /{def_id} to avoid FastAPI
# matching "meta", "by-module", "lookup" etc. as a def_id.

@router.get("/meta/field-types")
async def get_field_types():
    """Return the available field types for the admin editor."""
    return FIELD_TYPES


@router.get("")
async def list_module_defs(ctx: dict = Depends(get_current_user_with_tenant)):
    """List all module definitions for this tenant."""
    db = ctx["db"]
    # Seed defaults on first access
    await _seed_defaults(db)
    rows = await db.execute(text("""
        SELECT id, module, doctype, label, label_plural, icon, table_name,
               fields, list_settings, form_settings, dashboard_settings,
               workflow_settings, is_active, is_customized, sort_order,
               updated_at
        FROM module_definitions
        ORDER BY sort_order, module, doctype
    """))
    return [dict(r._mapping) for r in rows.fetchall()]


@router.get("/by-module/{module}")
async def list_by_module(module: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """List module definitions for a specific module."""
    db = ctx["db"]
    await _seed_defaults(db)
    rows = await db.execute(text("""
        SELECT id, module, doctype, label, label_plural, icon, table_name,
               fields, list_settings, form_settings, dashboard_settings,
               workflow_settings, is_active, is_customized, sort_order,
               updated_at
        FROM module_definitions
        WHERE module = :module AND is_active = TRUE
        ORDER BY sort_order, doctype
    """), {"module": module})
    return [dict(r._mapping) for r in rows.fetchall()]


@router.get("/lookup/{module}/{doctype}")
async def lookup_module_def(module: str, doctype: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Get a module definition by module + doctype."""
    db = ctx["db"]
    await _seed_defaults(db)
    row = await db.execute(text("""
        SELECT id, module, doctype, label, label_plural, icon, table_name,
               fields, list_settings, form_settings, dashboard_settings,
               workflow_settings, is_active, is_customized, sort_order,
               updated_at
        FROM module_definitions WHERE module = :module AND doctype = :doctype
    """), {"module": module, "doctype": doctype})
    result = row.fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="Module definition not found")
    return dict(result._mapping)


@router.get("/{def_id}")
async def get_module_def(def_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Get a single module definition by ID."""
    db = ctx["db"]
    row = await db.execute(text("""
        SELECT id, module, doctype, label, label_plural, icon, table_name,
               fields, list_settings, form_settings, dashboard_settings,
               workflow_settings, is_active, is_customized, sort_order,
               updated_at
        FROM module_definitions WHERE id = :id
    """), {"id": def_id})
    result = row.fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="Module definition not found")
    return dict(result._mapping)


@router.patch("/{def_id}")
async def update_module_def(def_id: str, body: ModuleDefUpdate, ctx: dict = Depends(require_admin_with_tenant)):
    """Update a module definition (admin only)."""
    db = ctx["db"]
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    sets = []
    params = {"id": def_id, "updated_by": ctx["sub"]}
    jsonb_fields = {"fields", "list_settings", "form_settings", "dashboard_settings", "workflow_settings"}

    for key, value in data.items():
        if key in jsonb_fields:
            sets.append(f"{key} = CAST(:{key} AS JSONB)")
            params[key] = json.dumps(value, ensure_ascii=False)
        else:
            sets.append(f"{key} = :{key}")
            params[key] = value

    sets.append("is_customized = TRUE")
    sets.append("updated_by = :updated_by")
    sets.append("updated_at = NOW()")

    sql = f"UPDATE module_definitions SET {', '.join(sets)} WHERE id = :id RETURNING id"
    result = await db.execute(text(sql), params)
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Module definition not found")
    await db.commit()
    return {"ok": True}


@router.post("/reset/{def_id}")
async def reset_module_def(def_id: str, ctx: dict = Depends(require_admin_with_tenant)):
    """Reset a module definition to its seed defaults (admin only)."""
    db = ctx["db"]
    # Get current module+doctype
    row = await db.execute(text("SELECT module, doctype FROM module_definitions WHERE id = :id"), {"id": def_id})
    current = row.fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="Module definition not found")

    # Find matching seed
    seed = next((s for s in SEED_MODULE_DEFS if s["module"] == current.module and s["doctype"] == current.doctype), None)
    if not seed:
        raise HTTPException(status_code=400, detail="No seed data available for this definition")

    await db.execute(text("""
        UPDATE module_definitions SET
            label = :label, label_plural = :label_plural, icon = :icon,
            fields = CAST(:fields AS JSONB),
            list_settings = CAST(:list_settings AS JSONB),
            form_settings = CAST(:form_settings AS JSONB),
            dashboard_settings = CAST(:dashboard_settings AS JSONB),
            workflow_settings = CAST(:workflow_settings AS JSONB),
            is_customized = FALSE, updated_at = NOW()
        WHERE id = :id
    """), {
        "id": def_id,
        "label": seed.get("label", ""),
        "label_plural": seed.get("label_plural", ""),
        "icon": seed.get("icon", ""),
        "fields": json.dumps(seed.get("fields", []), ensure_ascii=False),
        "list_settings": json.dumps(seed.get("list_settings", {}), ensure_ascii=False),
        "form_settings": json.dumps(seed.get("form_settings", {}), ensure_ascii=False),
        "dashboard_settings": json.dumps(seed.get("dashboard_settings", {}), ensure_ascii=False),
        "workflow_settings": json.dumps(seed.get("workflow_settings", {}), ensure_ascii=False),
    })
    await db.commit()
    return {"ok": True}


# ── Field type catalog (for the admin editor UI) ────────────────────────────

FIELD_TYPES = [
    {"value": "Data", "label": "文本", "icon": "text", "has_options": True, "options_hint": "Email, Phone, URL"},
    {"value": "Int", "label": "整数", "icon": "number"},
    {"value": "Float", "label": "小数", "icon": "number"},
    {"value": "Currency", "label": "金额", "icon": "money-bag"},
    {"value": "Check", "label": "勾选", "icon": "checkmark"},
    {"value": "Select", "label": "下拉选择", "icon": "list", "has_options": True, "options_hint": "每行一个选项"},
    {"value": "Link", "label": "关联", "icon": "link", "has_options": True, "options_hint": "关联实体名称"},
    {"value": "Date", "label": "日期", "icon": "calendar"},
    {"value": "Datetime", "label": "日期时间", "icon": "calendar"},
    {"value": "Text", "label": "长文本", "icon": "text"},
    {"value": "TextEditor", "label": "富文本", "icon": "text"},
    {"value": "Attach", "label": "附件", "icon": "paperclip"},
    {"value": "JSON", "label": "JSON", "icon": "code"},
    {"value": "Section Break", "label": "分区", "icon": "layout", "is_layout": True},
    {"value": "Column Break", "label": "分栏", "icon": "columns", "is_layout": True},
    {"value": "Tab Break", "label": "标签页", "icon": "tab", "is_layout": True},
]
