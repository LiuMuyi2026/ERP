"""
AI Features Router — Copilot, WhatsApp Classification, Lead Scoring,
Document Generation, and Dashboard Insights.

Endpoints:
  POST /ai/copilot/suggestions    — Context-aware business suggestions
  POST /ai/classify-message       — Classify a WhatsApp message intent
  GET  /ai/lead-score/{lead_id}   — Score + profile a lead
  POST /ai/lead-score/{lead_id}/refresh — Force re-score
  POST /ai/generate-document      — Generate business documents
  GET  /ai/insights               — Dashboard AI insights (daily brief)
  POST /ai/query                  — Natural language → SQL query
  GET  /ai/message-classifications/{contact_id} — Get classifications for a contact
"""

import json
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.deps import get_current_user_with_tenant
from app.core.ai import ai, AITaskType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai-features"])


# ──────────────────────────────────────────────────────────────────────
# Schemas
# ──────────────────────────────────────────────────────────────────────

class CopilotRequest(BaseModel):
    module: str  # "crm", "accounting", "whatsapp", "inventory", "hr"
    record_id: Optional[str] = None
    page_context: Optional[str] = None


class ClassifyMessageRequest(BaseModel):
    message_id: str
    content: str
    contact_name: Optional[str] = None
    direction: str = "inbound"


class GenerateDocumentRequest(BaseModel):
    template_type: str  # "contract", "meeting_minutes", "weekly_report", "monthly_report", "email_template"
    context_ids: list[str] = []
    extra_instructions: Optional[str] = None


class NLQueryRequest(BaseModel):
    question: str


# ──────────────────────────────────────────────────────────────────────
# 1. AI Copilot — Context-aware suggestions
# ──────────────────────────────────────────────────────────────────────

@router.post("/copilot/suggestions")
async def copilot_suggestions(body: CopilotRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    tid = ctx.get("tenant_id")

    # Build context based on module
    context_parts = []

    if body.module == "crm" and body.record_id:
        context_parts.extend(await _build_crm_context(db, body.record_id))
    elif body.module == "accounting":
        context_parts.extend(await _build_accounting_context(db))
    elif body.module == "whatsapp" and body.record_id:
        context_parts.extend(await _build_whatsapp_context(db, body.record_id))
    elif body.module == "inventory":
        context_parts.extend(await _build_inventory_context(db))
    elif body.module == "hr":
        context_parts.extend(await _build_hr_context(db))

    if body.page_context:
        context_parts.append(f"Page context: {body.page_context[:2000]}")

    if not context_parts:
        return {"suggestions": []}

    context = "\n\n".join(context_parts)

    prompt = f"""Based on the following business context, generate 3-5 actionable suggestions.
Each suggestion should be specific, data-driven, and immediately useful.

Return JSON array where each item has:
- "type": one of "follow_up", "risk_alert", "opportunity", "reminder", "insight"
- "title": short title (under 60 chars)
- "message": detailed suggestion (1-2 sentences)
- "priority": "high", "medium", or "low"
- "action_type": optional action like "navigate", "create_task", "send_message"
- "action_data": optional data for the action (e.g. record_id)

Context:
{context}

Generate suggestions in the same language as the business data (Chinese if data is in Chinese)."""

    result = await ai.run(
        AITaskType.ANALYZE, prompt,
        db=db, tenant_id=tid, user_id=ctx["sub"],
        system_instruction="You are a business intelligence copilot for an ERP system. Analyze data and provide actionable insights. Always respond with valid JSON array.",
        output_format="json",
        feature_name="copilot_suggestions",
    )

    if result.error:
        return {"suggestions": [], "error": result.error}

    suggestions = result.result_json if isinstance(result.result_json, list) else result.result_json.get("suggestions", [])
    return {"suggestions": suggestions}


async def _build_crm_context(db: AsyncSession, lead_id: str) -> list[str]:
    parts = []

    # Lead info
    row = await db.execute(text("SELECT * FROM leads WHERE id = :id"), {"id": lead_id})
    lead = row.fetchone()
    if not lead:
        return parts
    m = dict(lead._mapping)
    parts.append(f"Lead: {m.get('full_name', '')} | Company: {m.get('company', '')} | Status: {m.get('status', '')} | Source: {m.get('source', '')}")

    # Last contact date
    if m.get("last_contacted_at"):
        days_since = (datetime.now(timezone.utc) - m["last_contacted_at"].replace(tzinfo=timezone.utc)).days
        parts.append(f"Last contacted: {days_since} days ago")
    elif m.get("updated_at"):
        days_since = (datetime.now(timezone.utc) - m["updated_at"].replace(tzinfo=timezone.utc)).days
        parts.append(f"Last updated: {days_since} days ago")

    # Contracts
    try:
        contracts = await db.execute(text(
            "SELECT contract_no, status, contract_amount, currency FROM crm_contracts WHERE lead_id = :lid ORDER BY created_at DESC LIMIT 5"
        ), {"lid": lead_id})
        for c in contracts.fetchall():
            cm = c._mapping
            parts.append(f"Contract: {cm['contract_no']} | {cm['status']} | {cm.get('contract_amount','')} {cm.get('currency','')}")
    except Exception:
        pass

    # Recent interactions
    try:
        interactions = await db.execute(text(
            "SELECT channel, direction, summary, created_at FROM lead_interactions WHERE lead_id = :lid ORDER BY created_at DESC LIMIT 5"
        ), {"lid": lead_id})
        for i in interactions.fetchall():
            im = i._mapping
            parts.append(f"Interaction [{im.get('created_at','')}]: {im.get('channel','')} {im.get('direction','')} - {im.get('summary','')}")
    except Exception:
        pass

    # WhatsApp messages count
    try:
        wa = await db.execute(text("""
            SELECT COUNT(*) as cnt, MAX(timestamp) as last_msg
            FROM whatsapp_messages wm
            JOIN whatsapp_contacts wc ON wc.id = wm.wa_contact_id
            WHERE wc.lead_id = :lid
        """), {"lid": lead_id})
        wa_row = wa.fetchone()
        if wa_row and wa_row.cnt > 0:
            parts.append(f"WhatsApp messages: {wa_row.cnt} total, last: {wa_row.last_msg}")
    except Exception:
        pass

    # AI score if exists
    if m.get("ai_score") is not None:
        parts.append(f"Current AI Score: {m['ai_score']}/100")

    return parts


async def _build_accounting_context(db: AsyncSession) -> list[str]:
    parts = []

    # Overdue receivables
    try:
        row = await db.execute(text("""
            SELECT COUNT(*) as cnt, COALESCE(SUM(amount - COALESCE(received_amount,0)),0) as total
            FROM crm_receivables
            WHERE status = 'overdue' OR (due_date < NOW() AND status NOT IN ('received','cancelled'))
        """))
        r = row.fetchone()
        if r and r.cnt > 0:
            parts.append(f"Overdue receivables: {r.cnt} items, total outstanding: {r.total}")
    except Exception:
        pass

    # Due this week
    try:
        row = await db.execute(text("""
            SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total
            FROM crm_receivables
            WHERE due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
            AND status NOT IN ('received','cancelled')
        """))
        r = row.fetchone()
        if r and r.cnt > 0:
            parts.append(f"Due this week: {r.cnt} receivables totaling {r.total}")
    except Exception:
        pass

    # Monthly revenue comparison
    try:
        row = await db.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN received_amount END), 0) as this_month,
                COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
                    AND created_at < date_trunc('month', NOW()) THEN received_amount END), 0) as last_month
            FROM crm_receivables WHERE status = 'received'
        """))
        r = row.fetchone()
        if r:
            parts.append(f"Revenue this month: {r.this_month} | Last month: {r.last_month}")
    except Exception:
        pass

    # Recent invoices
    try:
        row = await db.execute(text("""
            SELECT COUNT(*) as cnt FROM invoices
            WHERE status = 'pending' AND created_at > NOW() - INTERVAL '30 days'
        """))
        r = row.fetchone()
        if r and r.cnt > 0:
            parts.append(f"Pending invoices (30d): {r.cnt}")
    except Exception:
        pass

    return parts


async def _build_whatsapp_context(db: AsyncSession, contact_id: str) -> list[str]:
    parts = []

    # Contact info
    try:
        row = await db.execute(text(
            "SELECT display_name, push_name, lead_id, last_message_at, unread_count FROM whatsapp_contacts WHERE id = :cid"
        ), {"cid": contact_id})
        c = row.fetchone()
        if c:
            name = c.display_name or c.push_name or "Unknown"
            parts.append(f"Contact: {name} | Unread: {c.unread_count}")
            if c.lead_id:
                lead_row = await db.execute(text("SELECT full_name, company, status FROM leads WHERE id = :id"), {"id": str(c.lead_id)})
                lead = lead_row.fetchone()
                if lead:
                    parts.append(f"Linked lead: {lead.full_name} ({lead.company}) - {lead.status}")
    except Exception:
        pass

    # Recent messages
    try:
        msgs = await db.execute(text("""
            SELECT direction, content, timestamp FROM whatsapp_messages
            WHERE wa_contact_id = :cid AND content IS NOT NULL AND content != ''
            ORDER BY timestamp DESC LIMIT 10
        """), {"cid": contact_id})
        for m in reversed(msgs.fetchall()):
            prefix = "Customer" if m.direction == "inbound" else "Agent"
            parts.append(f"{prefix}: {(m.content or '')[:200]}")
    except Exception:
        pass

    # Classifications
    try:
        cls = await db.execute(text("""
            SELECT wmc.intent, wmc.confidence, wmc.suggested_action
            FROM whatsapp_message_classifications wmc
            JOIN whatsapp_messages wm ON wm.id = wmc.message_id
            WHERE wm.wa_contact_id = :cid
            ORDER BY wmc.created_at DESC LIMIT 5
        """), {"cid": contact_id})
        intents = [f"{r.intent}({r.confidence:.0%})" for r in cls.fetchall()]
        if intents:
            parts.append(f"Recent intents: {', '.join(intents)}")
    except Exception:
        pass

    return parts


async def _build_inventory_context(db: AsyncSession) -> list[str]:
    parts = []
    try:
        row = await db.execute(text("""
            SELECT COUNT(*) as cnt FROM products
            WHERE stock_qty <= COALESCE(min_stock_qty, 10)
        """))
        r = row.fetchone()
        if r and r.cnt > 0:
            parts.append(f"Low stock products: {r.cnt} items below safety level")
    except Exception:
        pass
    try:
        row = await db.execute(text("SELECT COUNT(*) as cnt, COALESCE(SUM(stock_qty * unit_price),0) as val FROM products"))
        r = row.fetchone()
        if r:
            parts.append(f"Total products: {r.cnt}, inventory value: {r.val}")
    except Exception:
        pass
    return parts


async def _build_hr_context(db: AsyncSession) -> list[str]:
    parts = []
    try:
        row = await db.execute(text("SELECT COUNT(*) as cnt FROM employees WHERE status = 'active'"))
        r = row.fetchone()
        if r:
            parts.append(f"Active employees: {r.cnt}")
    except Exception:
        pass
    try:
        row = await db.execute(text("""
            SELECT COUNT(*) as cnt FROM leave_requests
            WHERE status = 'pending'
        """))
        r = row.fetchone()
        if r and r.cnt > 0:
            parts.append(f"Pending leave requests: {r.cnt}")
    except Exception:
        pass
    return parts


# ──────────────────────────────────────────────────────────────────────
# 2. WhatsApp Message Classification
# ──────────────────────────────────────────────────────────────────────

INTENT_LABELS = {
    "inquiry": "询价",
    "support": "售后",
    "payment": "付款",
    "complaint": "投诉",
    "followup": "跟进",
    "chitchat": "闲聊",
    "order": "下单",
    "logistics": "物流",
}


@router.post("/classify-message")
async def classify_message(body: ClassifyMessageRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    """Classify a single WhatsApp message intent."""
    db = ctx["db"]
    tid = ctx.get("tenant_id")

    if not body.content or not body.content.strip():
        return {"intent": "chitchat", "confidence": 0.5, "suggested_action": None}

    result = await _classify_message_content(db, tid, body.content, body.contact_name)

    # Store classification
    try:
        await db.execute(text("""
            INSERT INTO whatsapp_message_classifications (message_id, intent, confidence, sub_intent, suggested_action)
            VALUES (:mid, :intent, :conf, :sub, :action)
            ON CONFLICT DO NOTHING
        """), {
            "mid": body.message_id,
            "intent": result["intent"],
            "conf": result["confidence"],
            "sub": result.get("sub_intent"),
            "action": result.get("suggested_action"),
        })
        await db.commit()
    except Exception:
        await db.rollback()

    return result


async def _classify_message_content(db: AsyncSession, tenant_id, content: str, contact_name: str = None) -> dict:
    """Classify message content using AI."""
    prompt = f"""Classify this WhatsApp business message intent.

Message: "{content[:500]}"
{f'From: {contact_name}' if contact_name else ''}

Return JSON with:
- "intent": one of "inquiry", "support", "payment", "complaint", "followup", "chitchat", "order", "logistics"
- "confidence": 0.0 to 1.0
- "sub_intent": more specific description (e.g. "asking for product price", "requesting tracking number")
- "suggested_action": one of "create_lead", "assign_support", "link_payment", "flag_urgent", "auto_reply", null"""

    result = await ai.run(
        AITaskType.CLASSIFY, prompt,
        db=db, tenant_id=tenant_id,
        system_instruction="You are a message intent classifier for a B2B trade company. Respond with valid JSON only.",
        output_format="json",
        feature_name="wa_classify",
    )

    if result.error or not result.result_json:
        return {"intent": "chitchat", "confidence": 0.3, "suggested_action": None}

    return result.result_json


@router.get("/message-classifications/{contact_id}")
async def get_message_classifications(contact_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Get AI classifications for messages in a conversation."""
    db = ctx["db"]
    try:
        rows = await db.execute(text("""
            SELECT wmc.message_id, wmc.intent, wmc.confidence, wmc.sub_intent, wmc.suggested_action
            FROM whatsapp_message_classifications wmc
            JOIN whatsapp_messages wm ON wm.id = wmc.message_id
            WHERE wm.wa_contact_id = :cid
            ORDER BY wmc.created_at DESC LIMIT 100
        """), {"cid": contact_id})
        return [dict(r._mapping) for r in rows.fetchall()]
    except Exception:
        return []


# ──────────────────────────────────────────────────────────────────────
# 3. Lead Scoring + AI Profile
# ──────────────────────────────────────────────────────────────────────

@router.get("/lead-score/{lead_id}")
async def get_lead_score(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Get AI score and profile for a lead."""
    db = ctx["db"]

    row = await db.execute(text(
        "SELECT ai_score, ai_score_reasons, ai_score_updated_at, ai_profile, ai_profile_updated_at FROM leads WHERE id = :id"
    ), {"id": lead_id})
    lead = row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    return {
        "score": lead.ai_score,
        "reasons": lead.ai_score_reasons or [],
        "score_updated_at": lead.ai_score_updated_at,
        "profile": lead.ai_profile,
        "profile_updated_at": lead.ai_profile_updated_at,
    }


@router.post("/lead-score/{lead_id}/refresh")
async def refresh_lead_score(lead_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    """Force re-calculate AI score + profile for a lead."""
    db = ctx["db"]
    tid = ctx.get("tenant_id")

    # Gather all lead data
    row = await db.execute(text("SELECT * FROM leads WHERE id = :id"), {"id": lead_id})
    lead = row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead_data = dict(lead._mapping)

    # Interaction count
    interaction_count = 0
    wa_message_count = 0
    days_since_last_contact = None
    try:
        ic = await db.execute(text("SELECT COUNT(*) as cnt FROM lead_interactions WHERE lead_id = :lid"), {"lid": lead_id})
        interaction_count = ic.fetchone().cnt or 0
    except Exception:
        pass

    try:
        wc = await db.execute(text("""
            SELECT COUNT(*) as cnt, MAX(wm.timestamp) as last_msg
            FROM whatsapp_messages wm
            JOIN whatsapp_contacts wc ON wc.id = wm.wa_contact_id
            WHERE wc.lead_id = :lid
        """), {"lid": lead_id})
        wr = wc.fetchone()
        wa_message_count = wr.cnt or 0
        if wr.last_msg:
            days_since_last_contact = (datetime.now(timezone.utc) - wr.last_msg.replace(tzinfo=timezone.utc)).days
    except Exception:
        pass

    # Contract info
    contracts = []
    try:
        cr = await db.execute(text(
            "SELECT contract_no, status, contract_amount, currency FROM crm_contracts WHERE lead_id = :lid"
        ), {"lid": lead_id})
        contracts = [dict(r._mapping) for r in cr.fetchall()]
    except Exception:
        pass

    context = f"""Lead: {lead_data.get('full_name','')}
Company: {lead_data.get('company','')}
Industry: {lead_data.get('industry','')}
Country: {lead_data.get('country','')}
Status: {lead_data.get('status','')}
Source: {lead_data.get('source','')}
Interaction count: {interaction_count}
WhatsApp messages: {wa_message_count}
Days since last contact: {days_since_last_contact or 'unknown'}
Contracts: {json.dumps(contracts, default=str) if contracts else 'None'}
Notes: {(lead_data.get('notes') or '')[:500]}"""

    # Score
    score_prompt = f"""Score this sales lead from 0-100 based on conversion likelihood.

Scoring criteria:
- Company size/reputation (0-25 points)
- Engagement level: interaction frequency, WhatsApp activity (0-25 points)
- Deal progress: current status, contracts (0-25 points)
- Recency: how recently they were in contact (0-25 points)

{context}

Return JSON:
{{
  "score": <0-100>,
  "reasons": [
    {{"factor": "<factor name>", "points": <points>, "detail": "<explanation>"}}
  ],
  "recommendation": "<one sentence next-best-action>"
}}"""

    score_result = await ai.run(
        AITaskType.LEAD_SCORE, score_prompt,
        db=db, tenant_id=tid, user_id=ctx["sub"],
        system_instruction="You are a B2B sales lead scoring AI. Be data-driven and precise. Respond with JSON only.",
        output_format="json",
        feature_name="lead_score",
        entity_type="lead", entity_id=lead_id,
    )

    # Profile
    profile_prompt = f"""Generate a concise customer profile summary (3-5 sentences) for this lead.
Include: background assessment, engagement pattern, potential value, risk factors, and recommended approach.

{context}

Write in the same language as the lead data."""

    profile_result = await ai.run(
        AITaskType.ENRICH_PROFILE, profile_prompt,
        db=db, tenant_id=tid, user_id=ctx["sub"],
        system_instruction="You are a CRM analyst. Write concise, insightful profiles.",
        feature_name="lead_profile",
        entity_type="lead", entity_id=lead_id,
    )

    # Save results
    score = 50
    reasons = []
    if score_result.result_json:
        score = score_result.result_json.get("score", 50)
        reasons = score_result.result_json.get("reasons", [])

    profile_text = profile_result.result_text or ""

    await db.execute(text("""
        UPDATE leads SET
            ai_score = :score,
            ai_score_reasons = :reasons,
            ai_score_updated_at = NOW(),
            ai_profile = :profile,
            ai_profile_updated_at = NOW()
        WHERE id = :id
    """), {
        "id": lead_id,
        "score": score,
        "reasons": json.dumps(reasons),
        "profile": profile_text,
    })
    await db.commit()

    return {
        "score": score,
        "reasons": reasons,
        "recommendation": score_result.result_json.get("recommendation", "") if score_result.result_json else "",
        "profile": profile_text,
    }


# ──────────────────────────────────────────────────────────────────────
# 4. Document Generation
# ──────────────────────────────────────────────────────────────────────

@router.post("/generate-document")
async def generate_document(body: GenerateDocumentRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    tid = ctx.get("tenant_id")

    context_parts = []

    # Fetch context data based on IDs
    for cid in body.context_ids:
        # Try as lead
        try:
            row = await db.execute(text("SELECT * FROM leads WHERE id = :id"), {"id": cid})
            lead = row.fetchone()
            if lead:
                m = dict(lead._mapping)
                context_parts.append(f"Lead: {m.get('full_name','')} | Company: {m.get('company','')} | Email: {m.get('email','')} | Phone: {m.get('phone','')}")
                continue
        except Exception:
            pass
        # Try as contract
        try:
            row = await db.execute(text("SELECT * FROM crm_contracts WHERE id = :id"), {"id": cid})
            contract = row.fetchone()
            if contract:
                m = dict(contract._mapping)
                context_parts.append(f"Contract: {m.get('contract_no','')} | Amount: {m.get('contract_amount','')} {m.get('currency','')} | Status: {m.get('status','')}")
                continue
        except Exception:
            pass
        # Try as customer
        try:
            row = await db.execute(text("SELECT * FROM crm_accounts WHERE id = :id"), {"id": cid})
            acct = row.fetchone()
            if acct:
                m = dict(acct._mapping)
                context_parts.append(f"Customer: {m.get('name','')} | Industry: {m.get('industry','')} | Country: {m.get('country','')}")
        except Exception:
            pass

    templates = {
        "contract": "Generate a formal business contract document based on the following information. Include standard clauses for payment terms, delivery, warranty, and dispute resolution.",
        "meeting_minutes": "Generate meeting minutes from the following context. Include attendees (if known), key discussion points, decisions made, and action items.",
        "weekly_report": "Generate a weekly sales/business report based on the following data. Include summary metrics, key activities, upcoming tasks, and recommendations.",
        "monthly_report": "Generate a comprehensive monthly business report. Include performance metrics, trend analysis, highlights, and strategic recommendations.",
        "email_template": "Generate a professional business email based on the following context. Keep it concise and action-oriented.",
        "quotation": "Generate a formal quotation/proposal based on the following information. Include pricing, terms, validity period, and next steps.",
    }

    template_instruction = templates.get(body.template_type, "Generate a professional business document based on the context.")

    # For reports, fetch additional system data
    if body.template_type in ("weekly_report", "monthly_report"):
        interval = "7 days" if body.template_type == "weekly_report" else "30 days"
        try:
            # Leads created
            lr = await db.execute(text(f"SELECT COUNT(*) as cnt FROM leads WHERE created_at > NOW() - INTERVAL '{interval}'"))
            context_parts.append(f"New leads ({interval}): {lr.fetchone().cnt}")
        except Exception:
            pass
        try:
            # Contracts
            cr = await db.execute(text(f"""
                SELECT COUNT(*) as cnt, COALESCE(SUM(contract_amount),0) as total
                FROM crm_contracts WHERE created_at > NOW() - INTERVAL '{interval}'
            """))
            r = cr.fetchone()
            context_parts.append(f"New contracts ({interval}): {r.cnt}, total value: {r.total}")
        except Exception:
            pass
        try:
            # Receivables collected
            rr = await db.execute(text(f"""
                SELECT COUNT(*) as cnt, COALESCE(SUM(received_amount),0) as total
                FROM crm_receivables WHERE status = 'received' AND updated_at > NOW() - INTERVAL '{interval}'
            """))
            r = rr.fetchone()
            context_parts.append(f"Receivables collected ({interval}): {r.cnt}, total: {r.total}")
        except Exception:
            pass

    context = "\n".join(context_parts) if context_parts else "No specific context provided."

    prompt = f"""{template_instruction}

Context:
{context}

{f'Additional instructions: {body.extra_instructions}' if body.extra_instructions else ''}

Generate in the same language as the context data. Use proper formatting with headings and sections."""

    async def generate():
        try:
            async for chunk in ai.stream(
                AITaskType.GENERATE_DOCUMENT, prompt,
                db=db, tenant_id=tid, user_id=ctx["sub"],
                system_instruction="You are a professional business document generator. Create well-structured, formal documents.",
                feature_name="doc_generate",
            ):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ──────────────────────────────────────────────────────────────────────
# 5. Dashboard AI Insights + Natural Language Query
# ──────────────────────────────────────────────────────────────────────

@router.get("/insights")
async def get_insights(ctx: dict = Depends(get_current_user_with_tenant)):
    """Generate daily business insights brief."""
    db = ctx["db"]
    tid = ctx.get("tenant_id")

    # Check cache
    try:
        cache = await db.execute(text("""
            SELECT data FROM ai_insights_cache
            WHERE insight_type = 'daily_brief' AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1
        """))
        cached = cache.fetchone()
        if cached and cached.data:
            return cached.data
    except Exception:
        pass

    # Build data snapshot
    data_parts = []

    # Overdue receivables
    try:
        row = await db.execute(text("""
            SELECT COUNT(*) as cnt, COALESCE(SUM(amount - COALESCE(received_amount,0)),0) as total
            FROM crm_receivables
            WHERE (status = 'overdue' OR (due_date < NOW() AND status NOT IN ('received','cancelled')))
        """))
        r = row.fetchone()
        data_parts.append(f"Overdue receivables: {r.cnt} items, total: {r.total}")
    except Exception:
        pass

    # Due today
    try:
        row = await db.execute(text("""
            SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total
            FROM crm_receivables WHERE due_date::date = CURRENT_DATE AND status NOT IN ('received','cancelled')
        """))
        r = row.fetchone()
        data_parts.append(f"Due today: {r.cnt} receivables, total: {r.total}")
    except Exception:
        pass

    # Stale leads (7+ days no contact)
    try:
        row = await db.execute(text("""
            SELECT COUNT(*) as cnt FROM leads
            WHERE status NOT IN ('converted','lost','cold')
            AND (last_contacted_at IS NULL OR last_contacted_at < NOW() - INTERVAL '7 days')
            AND (updated_at IS NULL OR updated_at < NOW() - INTERVAL '7 days')
        """))
        r = row.fetchone()
        data_parts.append(f"Stale leads (7+ days no contact): {r.cnt}")
    except Exception:
        pass

    # Low stock
    try:
        row = await db.execute(text("""
            SELECT COUNT(*) as cnt FROM products
            WHERE stock_qty <= COALESCE(min_stock_qty, 10) AND stock_qty >= 0
        """))
        r = row.fetchone()
        data_parts.append(f"Low stock products: {r.cnt}")
    except Exception:
        pass

    # New leads today
    try:
        row = await db.execute(text("SELECT COUNT(*) as cnt FROM leads WHERE created_at::date = CURRENT_DATE"))
        r = row.fetchone()
        data_parts.append(f"New leads today: {r.cnt}")
    except Exception:
        pass

    # Recent WhatsApp unread
    try:
        row = await db.execute(text("SELECT SUM(unread_count) as cnt FROM whatsapp_contacts WHERE unread_count > 0"))
        r = row.fetchone()
        data_parts.append(f"Unread WhatsApp messages: {r.cnt or 0}")
    except Exception:
        pass

    # Pending tasks
    try:
        row = await db.execute(text("SELECT COUNT(*) as cnt FROM tasks WHERE status IN ('pending','in_progress')"))
        r = row.fetchone()
        data_parts.append(f"Open tasks: {r.cnt}")
    except Exception:
        pass

    if not data_parts:
        return {"brief": [], "generated_at": datetime.now(timezone.utc).isoformat()}

    prompt = f"""Based on this business data snapshot, generate a daily brief with 5-8 key insights.

Data:
{chr(10).join(data_parts)}

Return JSON:
{{
  "brief": [
    {{
      "type": "alert" | "opportunity" | "reminder" | "metric",
      "icon": "warning" | "trending_up" | "schedule" | "inventory" | "message" | "people" | "money",
      "title": "<short title>",
      "detail": "<1-2 sentence detail>",
      "priority": "high" | "medium" | "low",
      "action_url": "<optional: module path like /crm or /accounting>"
    }}
  ]
}}

Generate in Chinese. Prioritize actionable items first."""

    result = await ai.run(
        AITaskType.ANALYZE, prompt,
        db=db, tenant_id=tid, user_id=ctx["sub"],
        system_instruction="You are a business intelligence assistant. Generate concise, actionable daily briefs. Respond with JSON only.",
        output_format="json",
        feature_name="daily_insights",
    )

    response_data = {
        "brief": result.result_json.get("brief", []) if result.result_json else [],
        "raw_data": {line.split(":")[0].strip(): line.split(":", 1)[1].strip() if ":" in line else "" for line in data_parts},
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Cache for 1 hour
    try:
        await db.execute(text("""
            INSERT INTO ai_insights_cache (insight_type, user_id, data, expires_at)
            VALUES ('daily_brief', :uid, :data, NOW() + INTERVAL '1 hour')
        """), {"uid": ctx["sub"], "data": json.dumps(response_data, default=str)})
        await db.commit()
    except Exception:
        await db.rollback()

    return response_data


@router.post("/query")
async def natural_language_query(body: NLQueryRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    """Convert natural language question to SQL and execute (SELECT only)."""
    db = ctx["db"]
    tid = ctx.get("tenant_id")

    # Get table schema info
    schema_info = """Available tables and key columns:
- leads (id, full_name, company, email, phone, status, source, assigned_to, ai_score, created_at, updated_at, last_contacted_at)
- crm_accounts (id, name, industry, country, credit_level, status)
- crm_contracts (id, contract_no, lead_id, account_id, account_name, status, contract_amount, currency, created_at)
- crm_receivables (id, contract_id, amount, received_amount, due_date, status, created_at)
- products (id, name, sku, category, unit_price, stock_qty, min_stock_qty)
- invoices (id, invoice_no, customer_name, total_amount, currency, status, created_at)
- employees (id, full_name, email, department_id, position_id, status, employment_type)
- whatsapp_contacts (id, display_name, push_name, lead_id, last_message_at, unread_count)
- whatsapp_messages (id, wa_contact_id, direction, content, message_type, timestamp)
- tasks (id, title, status, assigned_to, due_date)
- lead_interactions (id, lead_id, channel, direction, summary, created_at)

Common joins: leads.id = crm_contracts.lead_id, crm_contracts.id = crm_receivables.contract_id, leads.assigned_to = users.id"""

    prompt = f"""Convert this natural language question to a PostgreSQL SELECT query.

Question: "{body.question}"

{schema_info}

Rules:
- ONLY generate SELECT queries (no INSERT/UPDATE/DELETE/DROP/ALTER)
- Use ILIKE for text matching
- Limit results to 50 rows maximum
- Use clear column aliases for display
- For Chinese names, search with ILIKE

Return JSON:
{{
  "sql": "<the SQL query>",
  "explanation": "<brief explanation of what the query does>",
  "columns": ["<column names for display>"]
}}"""

    result = await ai.run(
        AITaskType.ANALYZE, prompt,
        db=db, tenant_id=tid, user_id=ctx["sub"],
        system_instruction="You are a SQL expert. Generate safe, read-only PostgreSQL queries. Never generate DDL or DML statements. Respond with JSON only.",
        output_format="json",
        feature_name="nl_query",
    )

    if result.error or not result.result_json:
        return {"error": result.error or "Failed to generate query", "rows": [], "columns": []}

    sql = result.result_json.get("sql", "")
    explanation = result.result_json.get("explanation", "")
    columns = result.result_json.get("columns", [])

    # Safety check — only allow SELECT
    sql_upper = sql.strip().upper()
    if not sql_upper.startswith("SELECT"):
        return {"error": "Only SELECT queries are allowed", "rows": [], "columns": []}

    # Block dangerous patterns
    dangerous = re.compile(r'\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|EXEC|GRANT|REVOKE)\b', re.IGNORECASE)
    if dangerous.search(sql):
        return {"error": "Query contains disallowed statements", "rows": [], "columns": []}

    # Execute
    try:
        rows = await db.execute(text(sql))
        results = []
        for r in rows.fetchall():
            results.append(dict(r._mapping))
        return {
            "sql": sql,
            "explanation": explanation,
            "columns": columns,
            "rows": results[:50],
            "total": len(results),
        }
    except Exception as e:
        return {"sql": sql, "explanation": explanation, "error": str(e), "rows": [], "columns": []}


# ──────────────────────────────────────────────────────────────────────
# Background: Auto-classify incoming WhatsApp messages
# ──────────────────────────────────────────────────────────────────────

async def auto_classify_whatsapp_message(db: AsyncSession, tenant_id, message_id: str, content: str, contact_name: str = None):
    """Called from webhook handler to classify messages in background."""
    if not content or not content.strip() or len(content.strip()) < 3:
        return

    result = await _classify_message_content(db, tenant_id, content, contact_name)
    try:
        await db.execute(text("""
            INSERT INTO whatsapp_message_classifications (message_id, intent, confidence, sub_intent, suggested_action)
            VALUES (:mid, :intent, :conf, :sub, :action)
            ON CONFLICT DO NOTHING
        """), {
            "mid": message_id,
            "intent": result.get("intent", "chitchat"),
            "conf": result.get("confidence", 0.3),
            "sub": result.get("sub_intent"),
            "action": result.get("suggested_action"),
        })
        await db.commit()
    except Exception:
        await db.rollback()
