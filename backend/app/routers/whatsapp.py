"""WhatsApp integration API — bridge stub, will be replaced by Baileys service."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import text

from app.config import settings
from app.deps import get_current_user_with_tenant, require_tenant_admin
from app.services.ai.provider import generate_text_for_tenant

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class CreateAccountBody(BaseModel):
    label: Optional[str] = None
    phone_number: Optional[str] = None

class SendMessageBody(BaseModel):
    content: str
    message_type: str = "text"

class LinkLeadBody(BaseModel):
    lead_id: str

class TransferBody(BaseModel):
    target_employee_id: str

class InternalMessageBody(BaseModel):
    wa_account_id: str
    wa_jid: str
    wa_message_id: Optional[str] = None
    content: Optional[str] = None
    message_type: str = "text"
    media_url: Optional[str] = None
    media_mime_type: Optional[str] = None
    timestamp: Optional[str] = None
    push_name: Optional[str] = None

class InternalStatusBody(BaseModel):
    wa_message_id: str
    status: str

class InternalAuthBody(BaseModel):
    wa_account_id: str
    status: str
    wa_jid: Optional[str] = None
    phone_number: Optional[str] = None
    display_name: Optional[str] = None
    profile_pic_url: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _verify_bridge_secret(x_bridge_secret: str = Header(default="")):
    if settings.wa_bridge_secret and x_bridge_secret != settings.wa_bridge_secret:
        raise HTTPException(status_code=403, detail="Invalid bridge secret")


# ══════════════════════════════════════════════════════════════════════════════
# Account management (settings page)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/accounts")
async def list_accounts(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    rows = await db.execute(
        text("SELECT * FROM whatsapp_accounts WHERE owner_user_id = :uid AND is_active = TRUE ORDER BY created_at DESC"),
        {"uid": ctx["sub"]},
    )
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/accounts")
async def create_account(body: CreateAccountBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    account_id = str(uuid.uuid4())
    await db.execute(
        text("""INSERT INTO whatsapp_accounts (id, owner_user_id, label, phone_number, status, created_at)
                VALUES (:id, :uid, :label, :phone, 'pending_qr', NOW())"""),
        {"id": account_id, "uid": ctx["sub"], "label": body.label, "phone": body.phone_number},
    )
    await db.commit()
    return {"id": account_id, "status": "pending_qr"}


@router.get("/accounts/{account_id}/qr")
async def get_qr(account_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(
        text("SELECT id, status FROM whatsapp_accounts WHERE id = :id AND owner_user_id = :uid"),
        {"id": account_id, "uid": ctx["sub"]},
    )
    acc = row.fetchone()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    # Stub: return a placeholder QR data URL
    return {
        "account_id": account_id,
        "status": acc.status,
        "qr_data": "STUB_QR_PLACEHOLDER",
        "message": "Bridge not connected — showing stub QR",
    }


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(
        text("UPDATE whatsapp_accounts SET is_active = FALSE, status = 'disconnected', updated_at = NOW() WHERE id = :id AND owner_user_id = :uid"),
        {"id": account_id, "uid": ctx["sub"]},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}


@router.post("/accounts/{account_id}/reconnect")
async def reconnect_account(account_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    result = await db.execute(
        text("UPDATE whatsapp_accounts SET status = 'pending_qr', updated_at = NOW() WHERE id = :id AND owner_user_id = :uid AND is_active = TRUE"),
        {"id": account_id, "uid": ctx["sub"]},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True, "status": "pending_qr"}


# ══════════════════════════════════════════════════════════════════════════════
# HR admin — all-tenant account management
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/admin/accounts")
async def admin_list_accounts(ctx: dict = Depends(require_tenant_admin)):
    db = ctx["db"]
    rows = await db.execute(text("""
        SELECT a.*, u.full_name AS owner_name, u.email AS owner_email,
               e.full_name AS employee_name
        FROM whatsapp_accounts a
        LEFT JOIN users u ON u.id = a.owner_user_id
        LEFT JOIN employees e ON e.id = a.owner_employee_id
        WHERE a.is_active = TRUE
        ORDER BY a.created_at DESC
    """))
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/admin/accounts/{account_id}/transfer")
async def admin_transfer(account_id: str, body: TransferBody, ctx: dict = Depends(require_tenant_admin)):
    db = ctx["db"]
    # Find the target employee's user_id
    emp = await db.execute(
        text("SELECT id, user_id FROM employees WHERE id = :eid"),
        {"eid": body.target_employee_id},
    )
    emp_row = emp.fetchone()
    if not emp_row:
        raise HTTPException(status_code=404, detail="Target employee not found")
    result = await db.execute(
        text("""UPDATE whatsapp_accounts
                SET owner_employee_id = :eid, owner_user_id = :uid, updated_at = NOW()
                WHERE id = :id AND is_active = TRUE"""),
        {"id": account_id, "eid": body.target_employee_id, "uid": str(emp_row.user_id) if emp_row.user_id else ctx["sub"]},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}


@router.post("/admin/accounts/{account_id}/unbind")
async def admin_unbind(account_id: str, ctx: dict = Depends(require_tenant_admin)):
    db = ctx["db"]
    result = await db.execute(
        text("UPDATE whatsapp_accounts SET owner_employee_id = NULL, updated_at = NOW() WHERE id = :id AND is_active = TRUE"),
        {"id": account_id},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}


@router.post("/admin/accounts/{account_id}/logout")
async def admin_logout(account_id: str, ctx: dict = Depends(require_tenant_admin)):
    db = ctx["db"]
    result = await db.execute(
        text("UPDATE whatsapp_accounts SET status = 'disconnected', session_data = NULL, updated_at = NOW() WHERE id = :id AND is_active = TRUE"),
        {"id": account_id},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Conversations & Messages
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/conversations")
async def list_conversations(
    search: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    q = """
        SELECT c.*, a.display_name AS account_name, a.phone_number AS account_phone,
               l.full_name AS lead_name, l.status AS lead_status
        FROM whatsapp_contacts c
        JOIN whatsapp_accounts a ON a.id = c.wa_account_id AND a.is_active = TRUE
        LEFT JOIN leads l ON l.id = c.lead_id
        WHERE a.owner_user_id = :uid
    """
    params: dict = {"uid": ctx["sub"]}
    if search:
        q += " AND (c.display_name ILIKE :s OR c.push_name ILIKE :s OR c.phone_number ILIKE :s)"
        params["s"] = f"%{search}%"
    q += " ORDER BY c.last_message_at DESC NULLS LAST"
    rows = await db.execute(text(q), params)
    return [dict(r._mapping) for r in rows.fetchall()]


@router.get("/conversations/{contact_id}/messages")
async def get_messages(
    contact_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    # Verify ownership
    own = await db.execute(text("""
        SELECT c.id FROM whatsapp_contacts c
        JOIN whatsapp_accounts a ON a.id = c.wa_account_id
        WHERE c.id = :cid AND a.owner_user_id = :uid
    """), {"cid": contact_id, "uid": ctx["sub"]})
    if not own.fetchone():
        raise HTTPException(status_code=404, detail="Conversation not found")

    q = "SELECT * FROM whatsapp_messages WHERE wa_contact_id = :cid"
    params: dict = {"cid": contact_id}
    if before:
        q += " AND timestamp < :before"
        params["before"] = before
    q += " ORDER BY timestamp DESC LIMIT :lim"
    params["lim"] = min(limit, 200)
    rows = await db.execute(text(q), params)
    messages = [dict(r._mapping) for r in rows.fetchall()]
    messages.reverse()  # Return oldest-first
    return messages


@router.post("/conversations/{contact_id}/send")
async def send_message(contact_id: str, body: SendMessageBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # Verify ownership
    own = await db.execute(text("""
        SELECT c.id, c.wa_account_id FROM whatsapp_contacts c
        JOIN whatsapp_accounts a ON a.id = c.wa_account_id
        WHERE c.id = :cid AND a.owner_user_id = :uid
    """), {"cid": contact_id, "uid": ctx["sub"]})
    contact = own.fetchone()
    if not contact:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.execute(text("""
        INSERT INTO whatsapp_messages (id, wa_account_id, wa_contact_id, direction, message_type, content, status, timestamp, created_at)
        VALUES (:id, :aid, :cid, 'outbound', :mtype, :content, 'pending', :ts, :ts)
    """), {
        "id": msg_id, "aid": str(contact.wa_account_id), "cid": contact_id,
        "mtype": body.message_type, "content": body.content, "ts": now,
    })
    await db.execute(text("""
        UPDATE whatsapp_contacts SET last_message_at = :ts, updated_at = :ts WHERE id = :cid
    """), {"ts": now, "cid": contact_id})
    await db.commit()
    # Stub: in real implementation, forward to bridge
    return {"id": msg_id, "status": "pending", "message": "Stub — bridge not connected"}


@router.get("/admin/conversations")
async def admin_list_conversations(
    search: Optional[str] = None,
    ctx: dict = Depends(require_tenant_admin),
):
    db = ctx["db"]
    q = """
        SELECT c.*, a.display_name AS account_name, a.phone_number AS account_phone,
               a.owner_user_id, u.full_name AS owner_name,
               l.full_name AS lead_name, l.status AS lead_status
        FROM whatsapp_contacts c
        JOIN whatsapp_accounts a ON a.id = c.wa_account_id AND a.is_active = TRUE
        LEFT JOIN users u ON u.id = a.owner_user_id
        LEFT JOIN leads l ON l.id = c.lead_id
        WHERE 1=1
    """
    params: dict = {}
    if search:
        q += " AND (c.display_name ILIKE :s OR c.push_name ILIKE :s OR c.phone_number ILIKE :s)"
        params["s"] = f"%{search}%"
    q += " ORDER BY c.last_message_at DESC NULLS LAST"
    rows = await db.execute(text(q), params)
    return [dict(r._mapping) for r in rows.fetchall()]


# ══════════════════════════════════════════════════════════════════════════════
# CRM linkage
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/leads/{lead_id}/messages")
async def lead_messages(lead_id: str, limit: int = 50, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    rows = await db.execute(text("""
        SELECT m.*, c.display_name AS contact_name, c.phone_number AS contact_phone
        FROM whatsapp_messages m
        JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
        JOIN whatsapp_accounts a ON a.id = m.wa_account_id
        WHERE c.lead_id = :lid AND a.owner_user_id = :uid
        ORDER BY m.timestamp DESC
        LIMIT :lim
    """), {"lid": lead_id, "uid": ctx["sub"], "lim": min(limit, 200)})
    messages = [dict(r._mapping) for r in rows.fetchall()]
    messages.reverse()
    return messages


@router.post("/contacts/{contact_id}/link-lead")
async def link_lead(contact_id: str, body: LinkLeadBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # Verify ownership
    own = await db.execute(text("""
        SELECT c.id FROM whatsapp_contacts c
        JOIN whatsapp_accounts a ON a.id = c.wa_account_id
        WHERE c.id = :cid AND a.owner_user_id = :uid
    """), {"cid": contact_id, "uid": ctx["sub"]})
    if not own.fetchone():
        raise HTTPException(status_code=404, detail="Contact not found")
    result = await db.execute(
        text("UPDATE whatsapp_contacts SET lead_id = :lid, updated_at = NOW() WHERE id = :cid"),
        {"lid": body.lead_id, "cid": contact_id},
    )
    await db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Dashboard
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard")
async def dashboard(
    lead_id: Optional[str] = None,
    lead_status: Optional[str] = None,
    account_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: Optional[str] = "last_message",
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    role = ctx.get("role", "")
    is_admin = role in ("platform_admin", "tenant_admin")

    q = """
        SELECT c.*, a.display_name AS account_name, a.phone_number AS account_phone,
               a.owner_user_id, u.full_name AS owner_name,
               l.full_name AS lead_name, l.status AS lead_status,
               (SELECT content FROM whatsapp_messages wm WHERE wm.wa_contact_id = c.id ORDER BY wm.timestamp DESC LIMIT 1) AS last_message_preview
        FROM whatsapp_contacts c
        JOIN whatsapp_accounts a ON a.id = c.wa_account_id AND a.is_active = TRUE
        LEFT JOIN users u ON u.id = a.owner_user_id
        LEFT JOIN leads l ON l.id = c.lead_id
        WHERE 1=1
    """
    params: dict = {}

    if not is_admin:
        q += " AND a.owner_user_id = :uid"
        params["uid"] = ctx["sub"]
    if lead_id:
        q += " AND c.lead_id = :lid"
        params["lid"] = lead_id
    if lead_status:
        q += " AND l.status = :ls"
        params["ls"] = lead_status
    if account_id:
        q += " AND c.wa_account_id = :aid"
        params["aid"] = account_id
    if date_from:
        q += " AND c.last_message_at >= :df"
        params["df"] = date_from
    if date_to:
        q += " AND c.last_message_at <= :dt"
        params["dt"] = date_to

    if sort_by == "unread":
        q += " ORDER BY c.unread_count DESC, c.last_message_at DESC NULLS LAST"
    elif sort_by == "lead_status":
        q += " ORDER BY l.status, c.last_message_at DESC NULLS LAST"
    else:
        q += " ORDER BY c.last_message_at DESC NULLS LAST"

    rows = await db.execute(text(q), params)
    return [dict(r._mapping) for r in rows.fetchall()]


# ══════════════════════════════════════════════════════════════════════════════
# AI-powered conversation analysis
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_messages_text(db, contact_id: Optional[str], lead_id: Optional[str], uid: str, limit: int = 100) -> str:
    """Fetch messages as a formatted text block for AI prompt."""
    if lead_id:
        rows = await db.execute(text("""
            SELECT m.direction, m.content, m.timestamp, c.display_name
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = m.wa_account_id
            WHERE c.lead_id = :lid AND a.owner_user_id = :uid
            ORDER BY m.timestamp ASC LIMIT :lim
        """), {"lid": lead_id, "uid": uid, "lim": limit})
    elif contact_id:
        rows = await db.execute(text("""
            SELECT m.direction, m.content, m.timestamp
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
            WHERE m.wa_contact_id = :cid AND a.owner_user_id = :uid
            ORDER BY m.timestamp ASC LIMIT :lim
        """), {"cid": contact_id, "uid": uid, "lim": limit})
    else:
        return ""
    messages = rows.fetchall()
    if not messages:
        return ""
    lines = []
    for m in messages:
        ts = str(m.timestamp)[:16] if m.timestamp else ""
        role = "Sales" if m.direction == "outbound" else "Customer"
        lines.append(f"[{ts}] {role}: {m.content or '(media)'}")
    return "\n".join(lines)


class AiAnalysisBody(BaseModel):
    contact_id: Optional[str] = None
    lead_id: Optional[str] = None
    action: str  # summarize | enrich_profile | sales_strategy | sales_tips


@router.post("/ai/analyze")
async def ai_analyze(body: AiAnalysisBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    tenant_slug = ctx.get("tenant_slug")

    chat_text = await _fetch_messages_text(db, body.contact_id, body.lead_id, ctx["sub"])
    if not chat_text:
        return {"result": "No messages found to analyze."}

    # Build lead context if available
    lead_context = ""
    lid = body.lead_id
    if not lid and body.contact_id:
        r = await db.execute(text("SELECT lead_id FROM whatsapp_contacts WHERE id = :cid"), {"cid": body.contact_id})
        row = r.fetchone()
        if row and row.lead_id:
            lid = str(row.lead_id)
    if lid:
        lr = await db.execute(text("SELECT full_name, company, status, email, phone, source, ai_summary FROM leads WHERE id = :lid"), {"lid": lid})
        lead_row = lr.fetchone()
        if lead_row:
            lead_context = f"\nLead info: {lead_row.full_name or ''}, Company: {lead_row.company or ''}, Status: {lead_row.status or ''}, Source: {lead_row.source or ''}"

    prompts = {
        "summarize": f"""Summarize the following WhatsApp sales conversation concisely. Highlight:
- Key topics discussed
- Customer needs/pain points
- Action items and next steps
- Overall sentiment and engagement level
{lead_context}

Conversation:
{chat_text}

Write the summary in the same language as the conversation. Be concise but thorough.""",

        "enrich_profile": f"""Based on the following WhatsApp conversation, extract any customer profile information that can be inferred. Return structured data including:
- Customer name (if mentioned)
- Company/organization
- Role/title
- Location/timezone clues
- Product interests
- Budget hints
- Decision-making authority
- Communication preferences
- Pain points
- Key requirements
{lead_context}

Conversation:
{chat_text}

Return as a structured list. Only include information that can be clearly inferred from the conversation. Write in the same language as the conversation.""",

        "sales_strategy": f"""Analyze this WhatsApp sales conversation and generate a tailored sales strategy. Include:
- Current stage assessment (awareness/interest/consideration/decision)
- Recommended next steps (specific and actionable)
- Key objections to address
- Value propositions to emphasize
- Timing recommendations
- Suggested follow-up messages
- Risk factors
{lead_context}

Conversation:
{chat_text}

Provide actionable, specific recommendations. Write in the same language as the conversation.""",

        "sales_tips": f"""Based on this WhatsApp sales conversation, provide real-time sales coaching tips:
- What the salesperson is doing well
- Areas for improvement
- Suggested response techniques
- Rapport-building opportunities
- Closing signals to watch for
- Recommended tone adjustments
- Quick-win suggestions for the next message
{lead_context}

Conversation:
{chat_text}

Be specific and actionable. Reference actual messages where relevant. Write in the same language as the conversation.""",
    }

    prompt = prompts.get(body.action)
    if not prompt:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    try:
        result = await generate_text_for_tenant(db, tenant_slug, prompt)
        return {"result": result, "action": body.action}
    except Exception as e:
        logger.error("AI analyze failed: %s", e)
        raise HTTPException(status_code=500, detail="AI analysis failed")


# ══════════════════════════════════════════════════════════════════════════════
# Bridge internal callbacks (stub — will be called by Baileys bridge)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/internal/message-received")
async def internal_message_received(
    body: InternalMessageBody,
    ctx: dict = Depends(get_current_user_with_tenant),
    _secret: str = Depends(_verify_bridge_secret),
):
    db = ctx["db"]
    now = datetime.now(timezone.utc)
    ts = body.timestamp or now.isoformat()

    # Upsert contact
    await db.execute(text("""
        INSERT INTO whatsapp_contacts (wa_account_id, wa_jid, push_name, display_name, last_message_at, unread_count, created_at)
        VALUES (:aid, :jid, :pn, :pn, :ts, 1, NOW())
        ON CONFLICT (wa_account_id, wa_jid) DO UPDATE
        SET push_name = COALESCE(EXCLUDED.push_name, whatsapp_contacts.push_name),
            last_message_at = EXCLUDED.last_message_at,
            unread_count = whatsapp_contacts.unread_count + 1,
            updated_at = NOW()
    """), {"aid": body.wa_account_id, "jid": body.wa_jid, "pn": body.push_name, "ts": ts})

    # Get contact id
    contact = await db.execute(text(
        "SELECT id FROM whatsapp_contacts WHERE wa_account_id = :aid AND wa_jid = :jid"
    ), {"aid": body.wa_account_id, "jid": body.wa_jid})
    contact_row = contact.fetchone()
    contact_id = str(contact_row.id) if contact_row else None

    if contact_id:
        await db.execute(text("""
            INSERT INTO whatsapp_messages (wa_account_id, wa_contact_id, wa_message_id, direction, message_type, content, media_url, media_mime_type, status, timestamp, created_at)
            VALUES (:aid, :cid, :mid, 'inbound', :mtype, :content, :murl, :mmime, 'received', :ts, NOW())
        """), {
            "aid": body.wa_account_id, "cid": contact_id, "mid": body.wa_message_id,
            "mtype": body.message_type, "content": body.content,
            "murl": body.media_url, "mmime": body.media_mime_type, "ts": ts,
        })

    await db.commit()
    return {"ok": True}


@router.post("/internal/status-update")
async def internal_status_update(
    body: InternalStatusBody,
    ctx: dict = Depends(get_current_user_with_tenant),
    _secret: str = Depends(_verify_bridge_secret),
):
    db = ctx["db"]
    await db.execute(
        text("UPDATE whatsapp_messages SET status = :st WHERE wa_message_id = :mid"),
        {"st": body.status, "mid": body.wa_message_id},
    )
    await db.commit()
    return {"ok": True}


@router.post("/internal/auth-update")
async def internal_auth_update(
    body: InternalAuthBody,
    ctx: dict = Depends(get_current_user_with_tenant),
    _secret: str = Depends(_verify_bridge_secret),
):
    db = ctx["db"]
    sets = ["status = :st", "updated_at = NOW()"]
    params: dict = {"st": body.status, "id": body.wa_account_id}
    if body.wa_jid:
        sets.append("wa_jid = :jid")
        params["jid"] = body.wa_jid
    if body.phone_number:
        sets.append("phone_number = :phone")
        params["phone"] = body.phone_number
    if body.display_name:
        sets.append("display_name = :dn")
        params["dn"] = body.display_name
    if body.profile_pic_url:
        sets.append("profile_pic_url = :pic")
        params["pic"] = body.profile_pic_url
    await db.execute(text(f"UPDATE whatsapp_accounts SET {', '.join(sets)} WHERE id = :id"), params)
    await db.commit()
    return {"ok": True}
