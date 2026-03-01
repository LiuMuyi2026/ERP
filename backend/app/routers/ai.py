from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from app.deps import get_current_user_with_tenant
from app.services.ai.provider import stream_text_for_tenant
from app.services.ai.lead_extractor import extract_lead_from_conversation
from app.services.ai.ai_plus import execute_ai_tool
import uuid
import json
import re

router = APIRouter(prefix="/ai", tags=["ai"])

ERP_SYSTEM_INSTRUCTION = """You are Nexus AI, an intelligent ERP assistant.
Help users manage leads, contacts, employees, invoices, and inventory.
Be concise, helpful, and proactive in suggesting actions.

When the user asks to find a person or look up contact info:
- Show all available contact details: name, email, phone, WhatsApp, WeChat, Feishu, company, title, department.
- If the person appears in multiple tables (e.g. both leads and contacts), merge the information.
- If there are related records (contracts, interactions), briefly mention them.
- Format the results clearly with labels for each field."""


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    history: Optional[List[dict]] = None
    context_module: Optional[str] = None
    context_record_id: Optional[str] = None
    page_context: Optional[str] = None  # visible page text for context-aware AI


class AIToolExecute(BaseModel):
    context: str = ""
    selection: str = ""


def _extract_search_keywords(message: str) -> list[str]:
    """Extract meaningful search keywords from a user message.
    Returns a list of candidates ordered by specificity (most specific first).
    """
    # Strip common filler words/phrases (Chinese + English)
    noise = re.compile(
        r'(帮我|请|找一下|查一下|查找|搜索|查询|告诉我|给我|的联系方式|的信息|的资料|的详情|的电话|的邮箱|的合同|的订单|的发票|'
        r'联系方式|是谁|怎么联系|有哪些|有多少|'
        r'find|search|look up|contact info|details|information|who is|how to reach)\s*',
        re.IGNORECASE,
    )
    cleaned = noise.sub(' ', message).strip()
    # Remove punctuation
    cleaned = re.sub(r'[？?！!。，,、：:；;""''（）()\s]+', ' ', cleaned).strip()

    keywords = []
    # If cleaned text is short enough, it's likely the actual name/keyword
    if cleaned and len(cleaned) <= 40:
        keywords.append(cleaned)
    # Also try individual words/tokens (split by spaces)
    tokens = [t for t in cleaned.split() if len(t) >= 2]
    for t in tokens:
        if t not in keywords:
            keywords.append(t)
    # Fallback: use original message truncated
    if not keywords:
        keywords.append(message.strip()[:60])
    return keywords[:3]


async def _search_business_context(db, query: str, limit: int = 8) -> str:
    """Search across key business tables for context relevant to the user's query."""
    kw = f"%{query[:60]}%"
    snippets: list[str] = []

    # ── People / contact-heavy tables first ──
    searches = [
        ("联系人/contacts",
         """SELECT c.full_name, c.email, c.phone, c.whatsapp, c.wechat, c.feishu,
                   c.title, co.name AS company
            FROM contacts c LEFT JOIN companies co ON co.id = c.company_id
            WHERE c.full_name ILIKE :q OR c.email ILIKE :q OR c.phone ILIKE :q
               OR c.whatsapp ILIKE :q OR co.name ILIKE :q
            ORDER BY c.updated_at DESC NULLS LAST LIMIT :lim"""),
        ("线索/leads",
         """SELECT full_name, company, email, phone, whatsapp, title, status, source, ai_summary
            FROM leads
            WHERE full_name ILIKE :q OR company ILIKE :q OR email ILIKE :q
               OR phone ILIKE :q OR whatsapp ILIKE :q OR ai_summary ILIKE :q
            ORDER BY updated_at DESC NULLS LAST LIMIT :lim"""),
        ("员工/employees",
         """SELECT e.full_name, e.email, e.phone, e.title, e.status, e.employment_type,
                   d.name AS department, p.name AS position
            FROM employees e
            LEFT JOIN departments d ON d.id = e.department_id
            LEFT JOIN positions p ON p.id = e.position_id
            WHERE e.full_name ILIKE :q OR e.email ILIKE :q OR e.phone ILIKE :q
               OR e.title ILIKE :q OR d.name ILIKE :q
            ORDER BY e.updated_at DESC NULLS LAST LIMIT :lim"""),
        ("客户/crm_accounts",
         """SELECT name, industry, country, credit_level, status, notes
            FROM crm_accounts
            WHERE name ILIKE :q OR industry ILIKE :q OR country ILIKE :q OR notes ILIKE :q
            LIMIT :lim"""),
        ("供应商/suppliers",
         """SELECT name, contact_person, contact_info, rating, company_info
            FROM suppliers
            WHERE name ILIKE :q OR contact_person ILIKE :q OR contact_info ILIKE :q
            LIMIT :lim"""),
        ("合同/crm_contracts",
         """SELECT contract_no, account_name, status, contract_amount, currency, payment_method, incoterm
            FROM crm_contracts
            WHERE contract_no ILIKE :q OR account_name ILIKE :q
            LIMIT :lim"""),
        ("产品/products",
         """SELECT name, sku, category, unit_price, stock_qty
            FROM products
            WHERE name ILIKE :q OR sku ILIKE :q OR category ILIKE :q
            LIMIT :lim"""),
        ("发票/invoices",
         """SELECT invoice_no, customer_name, total_amount, currency, status
            FROM invoices
            WHERE invoice_no ILIKE :q OR customer_name ILIKE :q
            LIMIT :lim"""),
    ]

    # Column labels per table for structured output
    col_labels = {
        "联系人/contacts": ["姓名", "邮箱", "电话", "WhatsApp", "微信", "飞书", "职位", "公司"],
        "线索/leads": ["姓名", "公司", "邮箱", "电话", "WhatsApp", "职位", "状态", "来源", "AI摘要"],
        "员工/employees": ["姓名", "邮箱", "电话", "职位", "状态", "类型", "部门", "岗位"],
        "客户/crm_accounts": ["名称", "行业", "国家", "信用", "状态", "备注"],
        "供应商/suppliers": ["名称", "联系人", "联系方式", "评级", "公司信息"],
        "合同/crm_contracts": ["合同号", "客户", "状态", "金额", "币种", "付款方式", "贸易条款"],
        "产品/products": ["名称", "SKU", "类别", "单价", "库存"],
        "发票/invoices": ["发票号", "客户", "金额", "币种", "状态"],
    }

    for table_label, sql in searches:
        try:
            rows = await db.execute(text(sql), {"q": kw, "lim": limit})
            labels = col_labels.get(table_label, [])
            for r in rows.fetchall():
                parts = []
                for idx, v in enumerate(r):
                    if v is not None and str(v).strip():
                        label = labels[idx] if idx < len(labels) else f"col{idx}"
                        parts.append(f"{label}: {v}")
                if parts:
                    snippets.append(f"[{table_label}] {' | '.join(parts)}")
        except Exception:
            await db.rollback()

    return "\n".join(snippets[:30]) if snippets else ""


@router.post("/chat")
async def chat(body: ChatRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    history = body.history or []

    if body.conversation_id:
        result = await db.execute(
            text("SELECT messages FROM ai_conversations WHERE id = :id"),
            {"id": body.conversation_id}
        )
        row = result.fetchone()
        if row and row.messages:
            history = row.messages if isinstance(row.messages, list) else json.loads(row.messages)

    # ── Build context-aware system instruction ──
    system_instruction = ERP_SYSTEM_INSTRUCTION
    context_parts = []

    if body.page_context:
        context_parts.append(f"【当前页面内容】\n{body.page_context[:3000]}")

    # Search business data — extract meaningful keywords from the user's message
    raw_msg = body.message.strip()
    search_keywords = _extract_search_keywords(raw_msg)
    for kw in search_keywords:
        biz_context = await _search_business_context(db, kw)
        if biz_context:
            context_parts.append(f"【系统数据库匹配结果 (关键词: {kw})】\n{biz_context}")
            break  # use first successful match to avoid bloating context

    if context_parts:
        system_instruction += "\n\n---\n以下是与当前对话相关的背景信息，请结合这些信息回答用户问题：\n\n" + "\n\n".join(context_parts)

    async def generate():
        full_response = ""
        try:
            async for chunk in stream_text_for_tenant(db, ctx.get("tenant_id"), body.message, history=history, system_instruction=system_instruction):
                full_response += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        new_messages = history + [
            {"role": "user", "content": body.message},
            {"role": "model", "content": full_response},
        ]

        try:
            if not body.conversation_id:
                new_conv_id = str(uuid.uuid4())
                await db.execute(
                    text("INSERT INTO ai_conversations (id, user_id, messages, context_module, context_record_id) VALUES (:id, :user, :msgs, :module, :record)"),
                    {"id": new_conv_id, "user": ctx["sub"], "msgs": json.dumps(new_messages),
                     "module": body.context_module, "record": body.context_record_id}
                )
            else:
                await db.execute(
                    text("UPDATE ai_conversations SET messages = :msgs, updated_at = NOW() WHERE id = :id"),
                    {"msgs": json.dumps(new_messages), "id": body.conversation_id}
                )
            await db.commit()

            lead_check = await extract_lead_from_conversation(new_messages, db=db, tenant_id=ctx.get("tenant_id"))
            if lead_check.get("should_create_lead"):
                yield f"data: {json.dumps({'lead_suggestion': lead_check})}\n\n"
        except Exception:
            pass

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/conversations")
async def list_conversations(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("SELECT id, title, context_module, created_at, updated_at FROM ai_conversations WHERE user_id = :uid ORDER BY updated_at DESC LIMIT 20"),
        {"uid": ctx["sub"]}
    )
    return [dict(row._mapping) for row in result.fetchall()]


@router.get("/tools")
async def list_ai_tools(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(text("SELECT * FROM ai_tools WHERE is_active = TRUE ORDER BY name"))
    return [dict(row._mapping) for row in result.fetchall()]


@router.post("/tools/{tool_id}/execute")
async def execute_tool(tool_id: str, body: AIToolExecute, ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(text("SELECT * FROM ai_tools WHERE id = :id"), {"id": tool_id})
    tool = result.fetchone()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    async def generate():
        async for chunk in execute_ai_tool(tool.prompt_template, body.context, body.selection, tool.output_mode, db=ctx["db"], tenant_id=ctx.get("tenant_id")):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
