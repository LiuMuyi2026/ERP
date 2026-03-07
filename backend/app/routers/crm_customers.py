"""
CRM Customer Center — SOA-independent customer management module.

Endpoints:
  GET    /crm/customers
  GET    /crm/customers/countries
  GET    /crm/customers/{lead_id}
  POST   /crm/customers/{lead_id}/ai-portrait
  POST   /crm/customers/acquire
  GET    /crm/customers/acquisition-requests
  POST   /crm/customers/acquisition-requests/{request_id}/decide
  GET    /crm/customer-360/{lead_id}
  GET    /crm/accounts
  POST   /crm/accounts
"""

from datetime import datetime
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant
from app.routers.crm_shared import (
    AccountCreate,
    AcquireCustomerBody,
    DecideBody,
    _calc_understanding_score,
    _score_label,
    _is_admin,
    logger,
)

router = APIRouter(prefix="/crm", tags=["crm"])


# ═══════════════════════════════════════════════════════════════════════════════
# Customer Center
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/customers")
async def list_customers(
    search: str = "",
    skip: int = 0,
    limit: int = 40,
    status: str = "",
    customer_grade: str = "",
    customer_type: str = "",
    assigned_to: str = "",
    source: str = "",
    country: str = "",
    contract_count_min: int = -1,
    contract_count_max: int = -1,
    score_min: int = -1,
    score_max: int = -1,
    sort_by: str = "updated_at",
    sort_dir: str = "desc",
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    where_parts = [
        "(l.status IN ('contact','new','inquiry','replied','qualified','converted','payment','fulfillment','booking','procuring','quoted','negotiating') OR c.contract_count > 0)",
        "l.duplicate_of IS NULL",
        "(l.is_cold IS NULL OR l.is_cold = FALSE)",
    ]
    params: dict = {"skip": skip, "limit": limit}

    if search:
        where_parts.append(
            "(l.full_name ILIKE :search OR l.company ILIKE :search OR l.email ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    if status:
        vals = [v.strip() for v in status.split(",") if v.strip()]
        placeholders = ", ".join(f":st_{i}" for i in range(len(vals)))
        where_parts.append(f"l.status IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"st_{i}"] = v

    if customer_grade:
        vals = [v.strip() for v in customer_grade.split(",") if v.strip()]
        placeholders = ", ".join(f":cg_{i}" for i in range(len(vals)))
        where_parts.append(f"l.custom_fields->>'customer_grade' IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"cg_{i}"] = v

    if customer_type:
        vals = [v.strip() for v in customer_type.split(",") if v.strip()]
        placeholders = ", ".join(f":ct_{i}" for i in range(len(vals)))
        where_parts.append(f"l.custom_fields->>'customer_type' IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"ct_{i}"] = v

    if assigned_to:
        vals = [v.strip() for v in assigned_to.split(",") if v.strip()]
        placeholders = ", ".join(f":at_{i}" for i in range(len(vals)))
        where_parts.append(f"CAST(l.assigned_to AS text) IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"at_{i}"] = v

    if source:
        vals = [v.strip() for v in source.split(",") if v.strip()]
        placeholders = ", ".join(f":src_{i}" for i in range(len(vals)))
        where_parts.append(f"l.source IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"src_{i}"] = v

    if country:
        vals = [v.strip() for v in country.split(",") if v.strip()]
        placeholders = ", ".join(f":co_{i}" for i in range(len(vals)))
        where_parts.append(f"COALESCE(NULLIF(l.country,''), l.custom_fields->>'country', '') IN ({placeholders})")
        for i, v in enumerate(vals):
            params[f"co_{i}"] = v

    if contract_count_min >= 0:
        where_parts.append("COALESCE(c.contract_count, 0) >= :cc_min")
        params["cc_min"] = contract_count_min
    if contract_count_max >= 0:
        where_parts.append("COALESCE(c.contract_count, 0) <= :cc_max")
        params["cc_max"] = contract_count_max

    where_sql = " AND ".join(where_parts)

    _SORT_COLUMNS = {
        "full_name": "l.full_name",
        "company": "l.company",
        "customer_score": None,
        "contract_count": "contract_count",
        "total_contract_value": "total_contract_value",
        "status": "l.status",
        "updated_at": "l.updated_at",
        "created_at": "l.created_at",
        "customer_grade": "l.custom_fields->>'customer_grade'",
        "customer_type": "l.custom_fields->>'customer_type'",
    }
    direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
    sort_col = _SORT_COLUMNS.get(sort_by)
    sql_order = f"{sort_col} {direction} NULLS LAST" if sort_col else "l.updated_at DESC"

    rows = await db.execute(
        text(f"""
            SELECT
                l.id, l.full_name, l.company, l.title, l.email, l.phone, l.whatsapp,
                COALESCE(NULLIF(l.country, ''), l.custom_fields->>'country', '') AS country,
                l.source, l.status, l.ai_summary, l.custom_fields,
                l.assigned_to, l.created_at, l.updated_at,
                l.last_contacted_at, l.duplicate_of, l.is_cold,
                COALESCE(c.contract_count, 0)   AS contract_count,
                COALESCE(c.total_value, 0)       AS total_contract_value,
                COALESCE(c.last_contract_date, NULL) AS last_contract_date,
                u.full_name AS assigned_name
            FROM leads l
            LEFT JOIN (
                SELECT lead_id,
                       COUNT(*)                     AS contract_count,
                       SUM(contract_amount)         AS total_value,
                       MAX(sign_date)               AS last_contract_date
                FROM crm_contracts
                GROUP BY lead_id
            ) c ON c.lead_id = l.id
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE {where_sql}
            ORDER BY {sql_order}
            OFFSET :skip LIMIT :limit
        """),
        params,
    )

    customers = []
    for r in rows.fetchall():
        d = dict(r._mapping)
        d["customer_score"] = _calc_understanding_score(d)
        d["score_label"] = _score_label(d["customer_score"])
        customers.append(d)

    if score_min >= 0:
        customers = [c for c in customers if c["customer_score"] >= score_min]
    if score_max >= 0:
        customers = [c for c in customers if c["customer_score"] <= score_max]

    if sort_by == "customer_score":
        customers.sort(key=lambda x: x.get("customer_score", 0), reverse=(direction == "DESC"))

    count_row = await db.execute(
        text(f"""
            SELECT COUNT(*) FROM leads l
            LEFT JOIN (
                SELECT lead_id, COUNT(*) AS contract_count
                FROM crm_contracts GROUP BY lead_id
            ) c ON c.lead_id = l.id
            WHERE {where_sql}
        """),
        params,
    )
    total = count_row.scalar() or 0

    return {"customers": customers, "total": total}


@router.get("/customers/countries")
async def customer_countries(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    rows = await db.execute(text("""
        SELECT COALESCE(NULLIF(l.country, ''), l.custom_fields->>'country', '') AS country,
               COUNT(*) AS count
        FROM leads l
        LEFT JOIN (
            SELECT lead_id, COUNT(*) AS contract_count
            FROM crm_contracts GROUP BY lead_id
        ) c ON c.lead_id = l.id
        WHERE (l.status IN ('contact','new','inquiry','replied','qualified','converted','payment','fulfillment','booking','procuring','quoted','negotiating')
               OR c.contract_count > 0)
          AND l.duplicate_of IS NULL
          AND (l.is_cold IS NULL OR l.is_cold = FALSE)
        GROUP BY 1
        HAVING COALESCE(NULLIF(l.country, ''), l.custom_fields->>'country', '') != ''
        ORDER BY count DESC
    """))
    return [{"country": r.country, "count": r.count} for r in rows.fetchall()]


@router.get("/customers/{lead_id}")
async def get_customer(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(
        text("""
            SELECT l.id, l.full_name, l.company, l.title, l.email, l.phone, l.whatsapp,
                   COALESCE(NULLIF(l.country, ''), l.custom_fields->>'country', '') AS country,
                   l.source, l.status, l.ai_summary, l.custom_fields,
                   l.assigned_to, l.created_at, l.updated_at,
                   l.last_contacted_at, l.duplicate_of, l.is_cold,
                   COALESCE(c.contract_count, 0) AS contract_count,
                   COALESCE(c.total_value, 0)    AS total_contract_value,
                   u.full_name AS assigned_name
            FROM leads l
            LEFT JOIN (
                SELECT lead_id, COUNT(*) AS contract_count, SUM(contract_amount) AS total_value
                FROM crm_contracts GROUP BY lead_id
            ) c ON c.lead_id = l.id
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE l.id = CAST(:lid AS uuid)
        """),
        {"lid": lead_id},
    )
    r = row.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Customer not found")
    d = dict(r._mapping)
    d["customer_score"] = _calc_understanding_score(d)
    d["score_label"] = _score_label(d["customer_score"])
    return d


@router.post("/customers/{lead_id}/ai-portrait")
async def generate_ai_portrait(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    from app.services.ai.provider import generate_json_for_tenant

    db = ctx["db"]

    lead_row = await db.execute(
        text("SELECT * FROM leads WHERE id = CAST(:lid AS uuid)"),
        {"lid": lead_id},
    )
    lead = lead_row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Customer not found")
    lead_d = dict(lead._mapping)

    interactions_row = await db.execute(
        text("SELECT type, direction, content, created_at FROM interactions WHERE lead_id = CAST(:lid AS uuid) ORDER BY created_at DESC LIMIT 20"),
        {"lid": lead_id},
    )
    interactions = [dict(r._mapping) for r in interactions_row.fetchall()]

    wa_messages: list[dict] = []
    try:
        wa_msg_row = await db.execute(
            text("""SELECT m.direction, m.content, m.message_type, m.timestamp
                    FROM whatsapp_messages m
                    JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
                    WHERE c.lead_id = CAST(:lid AS uuid) AND m.is_deleted = FALSE
                      AND m.content IS NOT NULL AND m.content != ''
                    ORDER BY m.timestamp DESC LIMIT 30"""),
            {"lid": lead_id},
        )
        wa_messages = [dict(r._mapping) for r in wa_msg_row.fetchall()]
    except Exception:
        pass

    contracts_row = await db.execute(
        text("SELECT contract_no, contract_amount, currency, status, sign_date FROM crm_contracts WHERE lead_id = CAST(:lid AS uuid)"),
        {"lid": lead_id},
    )
    contracts = [dict(r._mapping) for r in contracts_row.fetchall()]

    score = _calc_understanding_score(lead_d)
    cf = lead_d.get("custom_fields") or {}

    prompt = f"""请根据以下客户五维结构化信息，生成一份专业的客户画像分析报告（AI客户画像）。

一、【基本联系信息】
姓名: {lead_d.get('full_name', '未知')}
邮箱: {lead_d.get('email', '未知')}
电话: {lead_d.get('phone', '未知')}
WhatsApp: {lead_d.get('whatsapp', '未知')}
性别: {cf.get('gender', '未知')}
职位: {cf.get('position', '') or lead_d.get('title', '未知')}
国家: {lead_d.get('country', '未知')}
城市: {cf.get('city', '未知')}
宗教: {cf.get('religion', '未知')}

二、【公司信息】
公司名称: {lead_d.get('company', '未知')}
行业: {cf.get('industry', '未知')}
公司网站: {cf.get('company_website', '未知')}
主营产品: {cf.get('main_products', '未知')}
公司简介: {cf.get('about_company', '未知')}

三、【业务信息】
客户类型: {cf.get('customer_type', '未知')}
客户质量: {cf.get('customer_quality', '未知')}
客户等级: {cf.get('customer_grade', '未知')}
产品类别: {cf.get('product_category', '未知')}
需求产品: {cf.get('required_products', '未知')}

四、【End Usage】
终端用途: {cf.get('end_usage', '未知')}

五、【商务细节】
下游付款方式: {cf.get('downstream_payment', '未知')}
年采购额: {cf.get('annual_purchase', '未知')}
竞争对手: {cf.get('competitor', '未知')}

【业务员备注】
需求备注: {cf.get('requirements_notes', '暂无')}
攻克策略: {cf.get('attack_notes', '暂无')}
联络备注: {cf.get('contact_notes', '暂无')}

来源: {lead_d.get('source', '未知')}
当前状态: {lead_d.get('status', '未知')}
资料完整度: {score}%

【历史互动记录】({len(interactions)} 条，最近10条)
{chr(10).join([f"- [{i['type']}] {i['content'][:150]}" for i in interactions[:10]]) if interactions else '暂无互动记录'}

【WhatsApp 聊天记录】({len(wa_messages)} 条，最近15条)
{chr(10).join([f"- [{m['direction']}] {m['content'][:200]}" for m in wa_messages[:15]]) if wa_messages else '暂无WhatsApp记录'}

【合同记录】({len(contracts)} 份)
{chr(10).join([f"- {c['contract_no']} {c['contract_amount']} {c['currency']} ({c['status']})" for c in contracts]) if contracts else '暂无合同'}

AI摘要: {lead_d.get('ai_summary', '暂无')}

请输出以下JSON格式的客户画像，所有字段都必须填写。特别注意根据客户的国家和文化背景进行分析：
{{
  "personality_tags": ["标签1", "标签2", "标签3"],
  "buying_intention": "高/中/低",
  "buying_intention_reason": "原因说明",
  "communication_style": "沟通风格描述（如：决策高效、需要大量跟进等）",
  "key_concerns": ["关注点1", "关注点2"],
  "recommended_strategy": "建议的跟进策略（100字以内）",
  "risk_factors": ["风险点1", "风险点2"],
  "opportunity_score": 75,
  "opportunity_reason": "商机评分说明",
  "next_actions": ["下一步行动1", "下一步行动2", "下一步行动3"],
  "customer_type": "潜力客户/核心客户/维护客户/流失风险客户",
  "industry_insight": "行业洞察（客户所在行业的特点和采购规律）",
  "cultural_awareness": "文化与国家特性分析（包括商业习惯、文化禁忌、沟通偏好、重要节假日等）",
  "country_business_customs": "国家商务建议（报价策略、谈判风格、决策链特点、付款偏好等）",
  "customer_needs_summary": "客户核心需求总结（基于五维信息的综合分析，包括产品需求、采购规律、合作潜力）"
}}"""

    try:
        result = await generate_json_for_tenant(
            db=db,
            tenant_id_or_slug=ctx.get("tenant_id"),
            prompt=prompt,
            system_instruction="你是一位资深的B2B国际贸易销售顾问和客户分析专家，擅长从有限信息中洞察客户需求和商机，对全球各国商业文化、贸易习惯有深入了解。请严格按JSON格式输出，不要添加任何解释。",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 生成失败: {e}")

    existing_cf = lead_d.get("custom_fields") or {}
    existing_cf["_ai_portrait"] = result
    existing_cf["_ai_portrait_at"] = datetime.utcnow().isoformat()

    await db.execute(
        text("UPDATE leads SET custom_fields = :cf, updated_at = NOW() WHERE id = CAST(:lid AS uuid)"),
        {"cf": json.dumps(existing_cf), "lid": lead_id},
    )
    await db.commit()

    return {"success": True, "portrait": result, "customer_score": score}


# ═══════════════════════════════════════════════════════════════════════════════
# Customer Acquisition
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/customers/acquire")
async def acquire_customer(
    body: AcquireCustomerBody,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    current_user = ctx["sub"]

    lead_row = await db.execute(
        text("SELECT id, assigned_to, full_name FROM leads WHERE id = :id"),
        {"id": body.customer_lead_id},
    )
    lead = lead_row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Customer not found")

    lead_dict = dict(lead._mapping)
    owner = str(lead_dict.get("assigned_to") or "")
    if owner == str(current_user):
        raise HTTPException(status_code=400, detail="You already own this customer")

    existing = await db.execute(
        text("""
            SELECT id FROM customer_acquisition_requests
            WHERE customer_lead_id = :lid AND requested_by = :uid AND status = 'pending'
        """),
        {"lid": body.customer_lead_id, "uid": current_user},
    )
    if existing.fetchone():
        raise HTTPException(status_code=400, detail="You already have a pending request for this customer")

    req_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO customer_acquisition_requests
                (id, customer_lead_id, requested_by, current_owner_id, status)
            VALUES (:id, :lid, :uid, :owner, 'pending')
        """),
        {"id": req_id, "lid": body.customer_lead_id, "uid": current_user, "owner": owner},
    )
    await db.commit()
    return {"id": req_id, "status": "pending"}


@router.get("/customers/acquisition-requests")
async def list_acquisition_requests(
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    role = ctx.get("role", "")
    current_user = ctx["sub"]

    if role in ("manager", "tenant_admin", "admin"):
        rows = await db.execute(
            text("""
                SELECT r.*, l.full_name AS customer_name, l.company AS customer_company,
                       req_u.full_name AS requester_name,
                       own_u.full_name AS owner_name
                FROM customer_acquisition_requests r
                JOIN leads l ON l.id = r.customer_lead_id
                LEFT JOIN users req_u ON req_u.id = r.requested_by
                LEFT JOIN users own_u ON own_u.id = r.current_owner_id
                WHERE r.status = 'pending'
                ORDER BY r.created_at DESC
            """)
        )
    else:
        rows = await db.execute(
            text("""
                SELECT r.*, l.full_name AS customer_name, l.company AS customer_company,
                       req_u.full_name AS requester_name,
                       own_u.full_name AS owner_name
                FROM customer_acquisition_requests r
                JOIN leads l ON l.id = r.customer_lead_id
                LEFT JOIN users req_u ON req_u.id = r.requested_by
                LEFT JOIN users own_u ON own_u.id = r.current_owner_id
                WHERE r.status = 'pending' AND r.current_owner_id = :uid
                ORDER BY r.created_at DESC
            """),
            {"uid": current_user},
        )

    return {"requests": [dict(r._mapping) for r in rows.fetchall()]}


@router.post("/customers/acquisition-requests/{request_id}/decide")
async def decide_acquisition(
    request_id: str,
    body: DecideBody,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    role = ctx.get("role", "")
    current_user = ctx["sub"]

    req_row = await db.execute(
        text("SELECT * FROM customer_acquisition_requests WHERE id = :id AND status = 'pending'"),
        {"id": request_id},
    )
    req = req_row.fetchone()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found or already decided")

    req_dict = dict(req._mapping)
    is_owner = str(req_dict["current_owner_id"]) == str(current_user)
    is_privileged = role in ("manager", "tenant_admin", "admin")
    if not is_owner and not is_privileged:
        raise HTTPException(status_code=403, detail="Not authorized to decide this request")

    await db.execute(
        text("""
            UPDATE customer_acquisition_requests
            SET status = :status, decided_by = :decided_by,
                decided_at = NOW(), decision_notes = :notes
            WHERE id = :id
        """),
        {"status": body.decision, "decided_by": current_user, "notes": body.notes, "id": request_id},
    )

    if body.decision == "approved":
        await db.execute(
            text("UPDATE leads SET assigned_to = :new_owner WHERE id = :lid"),
            {"new_owner": req_dict["requested_by"], "lid": req_dict["customer_lead_id"]},
        )

    await db.commit()
    return {"ok": True, "status": body.decision}


# ═══════════════════════════════════════════════════════════════════════════════
# Customer 360
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/customer-360/{lead_id}")
async def customer_360(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    lead_q = await db.execute(
        text("""
            SELECT l.*, u.full_name AS assigned_to_name
            FROM leads l
            LEFT JOIN users u ON u.id = l.assigned_to
            WHERE l.id = :id
        """),
        {"id": lead_id},
    )
    lead = lead_q.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead_dict = dict(lead._mapping)

    interactions_q = await db.execute(
        text("""
            SELECT i.*, u.full_name AS created_by_name
            FROM interactions i
            LEFT JOIN users u ON u.id = i.created_by
            WHERE i.lead_id = :lead_id
            ORDER BY i.created_at DESC
        """),
        {"lead_id": lead_id},
    )
    interactions = [dict(r._mapping) for r in interactions_q.fetchall()]

    contracts_q = await db.execute(
        text("""
            SELECT c.*,
                   COALESCE(a.name, '') AS account_label,
                   COALESCE(rr.total, 0) AS receivable_total,
                   COALESCE(rr.received, 0) AS receivable_received,
                   COALESCE(pp.total, 0) AS payable_total,
                   COALESCE(pp.paid, 0) AS payable_paid
            FROM crm_contracts c
            LEFT JOIN crm_accounts a ON a.id = c.account_id
            LEFT JOIN (
                SELECT contract_id, SUM(amount) AS total, SUM(received_amount) AS received
                FROM crm_receivables GROUP BY contract_id
            ) rr ON rr.contract_id = c.id
            LEFT JOIN (
                SELECT contract_id, SUM(amount) AS total, SUM(paid_amount) AS paid
                FROM crm_payables GROUP BY contract_id
            ) pp ON pp.contract_id = c.id
            WHERE c.lead_id = :lead_id
            ORDER BY c.created_at DESC
        """),
        {"lead_id": lead_id},
    )
    contracts = [dict(r._mapping) for r in contracts_q.fetchall()]

    audit_q = await db.execute(
        text("""
            SELECT al.*, u.full_name AS user_name, u.email AS user_email_addr
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.user_id
            WHERE al.resource_type = 'lead' AND al.resource_id = :lead_id
            ORDER BY al.created_at DESC
            LIMIT 100
        """),
        {"lead_id": lead_id},
    )
    audit_logs = [dict(r._mapping) for r in audit_q.fetchall()]

    related_conditions = []
    related_params: dict = {"lead_id": lead_id}
    email = lead_dict.get("email") or ""
    whatsapp = lead_dict.get("whatsapp") or ""
    full_name = lead_dict.get("full_name") or ""
    if email:
        related_conditions.append("(l.email IS NOT NULL AND l.email != '' AND l.email = :email)")
        related_params["email"] = email
    if whatsapp:
        related_conditions.append("(l.whatsapp IS NOT NULL AND l.whatsapp != '' AND l.whatsapp = :whatsapp)")
        related_params["whatsapp"] = whatsapp
    if full_name and not email and not whatsapp:
        related_conditions.append("l.full_name = :full_name")
        related_params["full_name"] = full_name

    related_leads: list = []
    if related_conditions:
        related_q = await db.execute(
            text(f"""
                SELECT l.*, u.full_name AS assigned_to_name
                FROM leads l
                LEFT JOIN users u ON u.id = l.assigned_to
                WHERE l.id != :lead_id
                AND ({" OR ".join(related_conditions)})
                ORDER BY l.created_at DESC
                LIMIT 50
            """),
            related_params,
        )
        related_leads = [dict(r._mapping) for r in related_q.fetchall()]

    lead_dict["customer_score"] = _calc_understanding_score(lead_dict)
    lead_dict["score_label"] = _score_label(lead_dict["customer_score"])

    wa_contacts_row = await db.execute(
        text("""
            SELECT c.id, c.wa_account_id, c.wa_jid, c.phone_number,
                   c.display_name, c.push_name, c.profile_pic_url,
                   c.is_group, c.last_message_at, c.unread_count
            FROM whatsapp_contacts c
            WHERE c.lead_id = :lead_id
            ORDER BY c.last_message_at DESC NULLS LAST
        """),
        {"lead_id": lead_id},
    )
    wa_contacts_list = [dict(r._mapping) for r in wa_contacts_row.fetchall()]
    wa_contact_dict = wa_contacts_list[0] if wa_contacts_list else None
    wa_messages: list = []
    if wa_contacts_list:
        contact_ids = [str(c["id"]) for c in wa_contacts_list]
        wa_msg_q = await db.execute(
            text("""
                SELECT id, wa_contact_id, direction, message_type, content,
                       media_url, media_mime_type, status, timestamp,
                       reply_to_message_id, is_deleted, is_edited, metadata
                FROM whatsapp_messages
                WHERE wa_contact_id = ANY(:cids) AND is_deleted = FALSE
                ORDER BY timestamp DESC
                LIMIT 200
            """),
            {"cids": contact_ids},
        )
        wa_messages = [dict(r._mapping) for r in wa_msg_q.fetchall()]

    return {
        "lead": lead_dict,
        "interactions": interactions,
        "contracts": contracts,
        "audit_logs": audit_logs,
        "related_leads": related_leads,
        "wa_contact": wa_contact_dict,
        "wa_contacts": wa_contacts_list,
        "wa_messages": wa_messages,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Accounts
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/accounts")
async def list_accounts(
    search: Optional[str] = None,
    user_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    role = ctx.get("role", "")
    if role not in ("tenant_admin", "platform_admin"):
        user_id = ctx["sub"]

    params: dict = {}
    where_parts = ["1=1"]
    if search:
        where_parts.append("name ILIKE :search")
        params["search"] = f"%{search}%"
    if user_id:
        where_parts.append("(owner_id = :uid OR created_by = :uid)")
        params["uid"] = user_id
    where = " AND ".join(where_parts)
    rows = await ctx["db"].execute(text(f"SELECT * FROM crm_accounts WHERE {where} ORDER BY created_at DESC"), params)
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/accounts")
async def create_account(body: AccountCreate, ctx: dict = Depends(get_current_user_with_tenant)):
    account_id = str(uuid.uuid4())
    await ctx["db"].execute(
        text(
            """
            INSERT INTO crm_accounts (id, name, industry, country, credit_level, status, notes, created_by)
            VALUES (:id, :name, :industry, :country, :credit_level, :status, :notes, :created_by)
            """
        ),
        {**body.model_dump(), "id": account_id, "created_by": ctx["sub"]},
    )
    await ctx["db"].commit()
    return {"id": account_id}
