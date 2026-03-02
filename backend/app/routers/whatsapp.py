"""WhatsApp integration API — connected to Baileys bridge service."""

import logging
import uuid
import json
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_current_user_with_tenant, require_admin_with_tenant, get_db
from app.utils.sql import safe_set_search_path
from app.services.ai.provider import generate_text_for_tenant
from app.services.wa_bridge import wa_bridge, BridgeError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


@router.get("/bridge-status")
async def bridge_status():
    """Public diagnostic: check if backend can reach the bridge."""
    import httpx
    url = settings.wa_bridge_url
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{url}/health", timeout=10)
            return {
                "bridge_url": url,
                "reachable": True,
                "status_code": resp.status_code,
                "bridge_response": resp.json(),
            }
    except Exception as e:
        return {
            "bridge_url": url,
            "reachable": False,
            "error": str(e),
        }


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class CreateAccountBody(BaseModel):
    label: Optional[str] = None
    phone_number: Optional[str] = None

class SendMessageBody(BaseModel):
    content: str = ""
    message_type: str = "text"
    media_url: Optional[str] = None
    media_mime_type: Optional[str] = None
    filename: Optional[str] = None
    caption: Optional[str] = None
    reply_to_message_id: Optional[str] = None

class LinkLeadBody(BaseModel):
    lead_id: str

class TransferBody(BaseModel):
    target_employee_id: str

class ReactBody(BaseModel):
    emoji: str

class ForwardBody(BaseModel):
    target_contact_id: str

class EditMessageBody(BaseModel):
    content: str

class SendPollBody(BaseModel):
    question: str
    options: List[str]
    allow_multiple: bool = False

class CheckNumbersBody(BaseModel):
    phone_numbers: List[str]
    account_id: str

class TypingBody(BaseModel):
    type: str = "composing"  # composing | paused

class DisappearingBody(BaseModel):
    duration: int  # 0=off, 86400=24h, 604800=7d, 7776000=90d

class GroupCreateBody(BaseModel):
    name: str
    participants: List[str]

class GroupParticipantsBody(BaseModel):
    participants: List[str]

# ── Internal bridge callback schemas ──

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
    profile_pic_url: Optional[str] = None
    wa_key: Optional[dict] = None
    quoted_message_id: Optional[str] = None
    quoted_content: Optional[str] = None
    direction: Optional[str] = None
    is_history_sync: bool = False

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

class InternalReactionBody(BaseModel):
    wa_account_id: str
    wa_message_id: str
    reactor_jid: str
    emoji: Optional[str] = None
    timestamp: Optional[str] = None

class InternalMessageDeletedBody(BaseModel):
    wa_account_id: str
    wa_message_id: str

class InternalMessageEditedBody(BaseModel):
    wa_account_id: str
    wa_message_id: str
    new_content: str
    timestamp: Optional[str] = None

class InternalPollVoteBody(BaseModel):
    wa_account_id: str
    wa_message_id: str
    voter_jid: str
    selected_options: List[int] = []

class InternalGroupUpdateBody(BaseModel):
    wa_account_id: str
    group_jid: str
    metadata: dict = {}

class InternalGroupParticipantsBody(BaseModel):
    wa_account_id: str
    group_jid: str
    action: str
    participants: List[str] = []

class InternalLabelsBody(BaseModel):
    wa_account_id: str
    labels: List[dict] = []

class InternalLabelAssociationBody(BaseModel):
    wa_account_id: str
    label_id: str
    chat_jid: str
    action: str  # add | remove


# ── Helpers ──────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_bridge_context(
    x_bridge_secret: str = Header(default=""),
    x_tenant_slug: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
):
    if not settings.wa_bridge_secret or x_bridge_secret != settings.wa_bridge_secret:
        raise HTTPException(status_code=403, detail="Invalid bridge secret")
    if not x_tenant_slug:
        raise HTTPException(status_code=400, detail="X-Tenant-Slug header is required")
    tenant = await db.execute(
        text("SELECT is_active, schema_provisioned FROM platform.tenants WHERE slug = :slug"),
        {"slug": x_tenant_slug},
    )
    tenant_row = tenant.fetchone()
    if not tenant_row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if not tenant_row.is_active:
        raise HTTPException(status_code=403, detail="Tenant is disabled")
    await safe_set_search_path(db, x_tenant_slug)
    return {"db": db, "tenant_slug": x_tenant_slug}


async def _verify_contact_ownership(db, contact_id: str, uid: str):
    """Verify user owns this contact via account ownership. Returns contact row."""
    own = await db.execute(text("""
        SELECT c.id, c.wa_account_id, c.wa_jid FROM whatsapp_contacts c
        JOIN whatsapp_accounts a ON a.id = c.wa_account_id
        WHERE c.id = :cid AND a.owner_user_id = :uid
    """), {"cid": contact_id, "uid": uid})
    contact = own.fetchone()
    if not contact:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return contact


async def _get_message_with_key(db, message_id: str, contact_id: str):
    """Get a message and its wa_key from metadata."""
    row = await db.execute(text("""
        SELECT id, wa_message_id, wa_contact_id, direction, metadata
        FROM whatsapp_messages WHERE id = :mid AND wa_contact_id = :cid
    """), {"mid": message_id, "cid": contact_id})
    msg = row.fetchone()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    metadata = msg.metadata if isinstance(msg.metadata, dict) else (json.loads(msg.metadata) if msg.metadata else {})
    wa_key = metadata.get("wa_key")
    if not wa_key:
        raise HTTPException(status_code=400, detail="Message has no wa_key for this operation")
    return msg, wa_key


# ══════════════════════════════════════════════════════════════════════════════
# Account management
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
    bridge_result: dict = {}
    try:
        bridge_result = await wa_bridge.start_session(account_id, ctx["tenant_slug"])
    except BridgeError as e:
        logger.warning("Bridge unavailable when creating account %s: %s", account_id, e)
        bridge_result = {"ok": False, "error": str(e)}
    return {"id": account_id, "status": "pending_qr", "bridge": bridge_result}


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
    try:
        bridge_data = await wa_bridge.get_qr(account_id)
    except BridgeError as e:
        logger.warning("Bridge unavailable for QR poll on account %s: %s", account_id, e)
        return {"account_id": account_id, "status": "bridge_unavailable", "qr_data": None, "error": str(e)}
    return {
        "account_id": account_id,
        "status": bridge_data.get("status", acc.status),
        "qr_data": bridge_data.get("qr_data"),
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
    try:
        await wa_bridge.close_session(account_id, logout=False)
    except BridgeError as e:
        logger.warning("Bridge unavailable when disconnecting account %s: %s", account_id, e)
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
    try:
        await wa_bridge.start_session(account_id, ctx["tenant_slug"])
    except BridgeError as e:
        logger.warning("Bridge unavailable when reconnecting account %s: %s", account_id, e)
    return {"ok": True, "status": "pending_qr"}


# ══════════════════════════════════════════════════════════════════════════════
# Admin account management
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/admin/accounts")
async def admin_list_accounts(ctx: dict = Depends(require_admin_with_tenant)):
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
async def admin_transfer(account_id: str, body: TransferBody, ctx: dict = Depends(require_admin_with_tenant)):
    db = ctx["db"]
    emp = await db.execute(text("SELECT id, user_id FROM employees WHERE id = :eid"), {"eid": body.target_employee_id})
    emp_row = emp.fetchone()
    if not emp_row:
        raise HTTPException(status_code=404, detail="Target employee not found")
    result = await db.execute(
        text("""UPDATE whatsapp_accounts SET owner_employee_id = :eid, owner_user_id = :uid, updated_at = NOW()
                WHERE id = :id AND is_active = TRUE"""),
        {"id": account_id, "eid": body.target_employee_id, "uid": str(emp_row.user_id) if emp_row.user_id else ctx["sub"]},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"ok": True}


@router.post("/admin/accounts/{account_id}/unbind")
async def admin_unbind(account_id: str, ctx: dict = Depends(require_admin_with_tenant)):
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
async def admin_logout(account_id: str, ctx: dict = Depends(require_admin_with_tenant)):
    db = ctx["db"]
    result = await db.execute(
        text("UPDATE whatsapp_accounts SET status = 'disconnected', session_data = NULL, updated_at = NOW() WHERE id = :id AND is_active = TRUE"),
        {"id": account_id},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    await wa_bridge.close_session(account_id, logout=True)
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Conversations & Messages
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/conversations")
async def list_conversations(
    search: Optional[str] = None,
    is_group: Optional[bool] = None,
    label_id: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    q = """
        SELECT c.*, a.display_name AS account_name, a.phone_number AS account_phone,
               l.full_name AS lead_name, l.status AS lead_status,
               ca.name AS crm_account_name
        FROM whatsapp_contacts c
        JOIN whatsapp_accounts a ON a.id = c.wa_account_id AND a.is_active = TRUE
        LEFT JOIN leads l ON l.id = c.lead_id
        LEFT JOIN crm_accounts ca ON ca.id = c.account_id
        WHERE a.owner_user_id = :uid
    """
    params: dict = {"uid": ctx["sub"]}
    if search:
        q += " AND (c.display_name ILIKE :s OR c.push_name ILIKE :s OR c.phone_number ILIKE :s)"
        params["s"] = f"%{search}%"
    if is_group is not None:
        q += " AND c.is_group = :ig"
        params["ig"] = is_group
    if label_id:
        q += " AND c.wa_labels @> :label_json::jsonb"
        params["label_json"] = json.dumps([label_id])
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
    await _verify_contact_ownership(db, contact_id, ctx["sub"])
    q = """SELECT m.*, u.display_name AS created_by_name
           FROM whatsapp_messages m LEFT JOIN users u ON u.id = m.created_by
           WHERE m.wa_contact_id = :cid AND m.is_deleted = FALSE"""
    params: dict = {"cid": contact_id}
    if before:
        q += " AND m.timestamp < :before"
        params["before"] = before
    q += " ORDER BY m.timestamp DESC LIMIT :lim"
    params["lim"] = min(limit, 200)
    rows = await db.execute(text(q), params)
    messages = [dict(r._mapping) for r in rows.fetchall()]
    messages.reverse()

    # Fetch reactions for these messages
    if messages:
        msg_ids = [str(m["id"]) for m in messages]
        reaction_rows = await db.execute(text("""
            SELECT r.* FROM whatsapp_reactions r
            JOIN whatsapp_messages m ON m.id = r.wa_message_id
            WHERE r.wa_message_id = ANY(:ids::uuid[])
        """), {"ids": msg_ids})
        reactions_by_msg: dict = {}
        for r in reaction_rows.fetchall():
            mid = str(r.wa_message_id)
            reactions_by_msg.setdefault(mid, []).append({"reactor_jid": r.reactor_jid, "emoji": r.emoji})
        for m in messages:
            m["reactions"] = reactions_by_msg.get(str(m["id"]), [])

    return messages


@router.post("/conversations/{contact_id}/send")
async def send_message(contact_id: str, body: SendMessageBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    account_id = str(contact.wa_account_id)
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # If replying, get the quoted message wa_key
    quoted_wa_key = None
    if body.reply_to_message_id:
        _, quoted_wa_key = await _get_message_with_key(db, body.reply_to_message_id, contact_id)

    await db.execute(text("""
        INSERT INTO whatsapp_messages (id, wa_account_id, wa_contact_id, direction, message_type, content,
            media_url, media_mime_type, status, timestamp, created_at, reply_to_message_id, metadata, created_by)
        VALUES (:id, :aid, :cid, 'outbound', :mtype, :content, :murl, :mmime, 'pending', :ts, :ts, :reply_id, :meta, :created_by)
    """), {
        "id": msg_id, "aid": account_id, "cid": contact_id,
        "mtype": body.message_type, "content": body.content or body.caption or "",
        "murl": body.media_url, "mmime": body.media_mime_type,
        "ts": now, "reply_id": body.reply_to_message_id,
        "meta": json.dumps({}), "created_by": ctx["sub"],
    })
    await db.execute(text("""
        UPDATE whatsapp_contacts SET last_message_at = :ts, updated_at = :ts WHERE id = :cid
    """), {"ts": now, "cid": contact_id})
    await db.commit()

    bridge_result = await wa_bridge.send_message(
        account_id, contact.wa_jid, body.content, body.message_type,
        media_url=body.media_url, media_mime_type=body.media_mime_type,
        filename=body.filename, caption=body.caption,
        quoted_wa_key=quoted_wa_key,
    )
    wa_message_id = bridge_result.get("wa_message_id")
    wa_key = bridge_result.get("wa_key")
    status = bridge_result.get("status", "pending")

    update_meta = json.dumps({"wa_key": wa_key}) if wa_key else "{}"
    if wa_message_id:
        await db.execute(
            text("UPDATE whatsapp_messages SET wa_message_id = :mid, status = :st, metadata = :meta WHERE id = :id"),
            {"mid": wa_message_id, "st": status, "id": msg_id, "meta": update_meta},
        )
        await db.commit()

    return {"id": msg_id, "wa_message_id": wa_message_id, "status": status}


# ── Read receipts ──

@router.post("/conversations/{contact_id}/read")
async def mark_conversation_read(contact_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    account_id = str(contact.wa_account_id)

    # Get recent unread message IDs
    rows = await db.execute(text("""
        SELECT wa_message_id FROM whatsapp_messages
        WHERE wa_contact_id = :cid AND direction = 'inbound' AND status != 'read'
        AND wa_message_id IS NOT NULL
        ORDER BY timestamp DESC LIMIT 20
    """), {"cid": contact_id})
    msg_ids = [r.wa_message_id for r in rows.fetchall()]

    # Reset unread count
    await db.execute(text("UPDATE whatsapp_contacts SET unread_count = 0, updated_at = NOW() WHERE id = :cid"), {"cid": contact_id})
    await db.commit()

    # Tell bridge to send read receipts
    if msg_ids:
        await wa_bridge.mark_read(account_id, contact.wa_jid, msg_ids)

    return {"ok": True}


# ── Typing indicator ──

@router.post("/conversations/{contact_id}/typing")
async def send_typing(contact_id: str, body: TypingBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    await wa_bridge.send_presence(str(contact.wa_account_id), contact.wa_jid, body.type)
    return {"ok": True}


# ── Reactions ──

@router.post("/conversations/{contact_id}/messages/{message_id}/react")
async def react_to_message(contact_id: str, message_id: str, body: ReactBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    _, wa_key = await _get_message_with_key(db, message_id, contact_id)
    await wa_bridge.send_reaction(str(contact.wa_account_id), contact.wa_jid, wa_key, body.emoji)
    return {"ok": True}


# ── Forward ──

@router.post("/conversations/{contact_id}/messages/{message_id}/forward")
async def forward_msg(contact_id: str, message_id: str, body: ForwardBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    target_contact = await _verify_contact_ownership(db, body.target_contact_id, ctx["sub"])
    _, wa_key = await _get_message_with_key(db, message_id, contact_id)

    result = await wa_bridge.forward_message(
        str(contact.wa_account_id), contact.wa_jid, target_contact.wa_jid, wa_key,
    )
    return result


# ── Delete (revoke) ──

@router.delete("/conversations/{contact_id}/messages/{message_id}")
async def delete_msg(contact_id: str, message_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    msg, wa_key = await _get_message_with_key(db, message_id, contact_id)
    if msg.direction != "outbound":
        raise HTTPException(status_code=400, detail="Can only delete own messages")

    await wa_bridge.delete_message(str(contact.wa_account_id), contact.wa_jid, wa_key)
    await db.execute(text("""
        UPDATE whatsapp_messages SET is_deleted = TRUE, content = NULL, updated_at = NOW() WHERE id = :id
    """), {"id": message_id})
    await db.commit()
    return {"ok": True}


# ── Edit ──

@router.patch("/conversations/{contact_id}/messages/{message_id}")
async def edit_msg(contact_id: str, message_id: str, body: EditMessageBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    msg, wa_key = await _get_message_with_key(db, message_id, contact_id)
    if msg.direction != "outbound":
        raise HTTPException(status_code=400, detail="Can only edit own messages")

    await wa_bridge.edit_message(str(contact.wa_account_id), contact.wa_jid, wa_key, body.content)

    # Store old content in edit_history
    old_row = await db.execute(text("SELECT content, edit_history FROM whatsapp_messages WHERE id = :id"), {"id": message_id})
    old = old_row.fetchone()
    history = json.loads(old.edit_history) if old and old.edit_history else []
    if old and old.content:
        history.append({"content": old.content, "edited_at": _now_iso()})
    await db.execute(text("""
        UPDATE whatsapp_messages SET content = :content, is_edited = TRUE, edit_history = :history WHERE id = :id
    """), {"content": body.content, "history": json.dumps(history), "id": message_id})
    await db.commit()
    return {"ok": True}


# ── Polls ──

@router.post("/conversations/{contact_id}/send-poll")
async def send_poll(contact_id: str, body: SendPollBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    account_id = str(contact.wa_account_id)

    result = await wa_bridge.send_poll(account_id, contact.wa_jid, body.question, body.options, body.allow_multiple)
    wa_message_id = result.get("wa_message_id")

    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.execute(text("""
        INSERT INTO whatsapp_messages (id, wa_account_id, wa_contact_id, wa_message_id, direction, message_type,
            content, status, timestamp, created_at, created_by)
        VALUES (:id, :aid, :cid, :wmid, 'outbound', 'poll', :content, 'sent', :ts, :ts, :created_by)
    """), {"id": msg_id, "aid": account_id, "cid": contact_id, "wmid": wa_message_id, "content": body.question, "ts": now, "created_by": ctx["sub"]})

    # Store poll metadata
    poll_id = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO whatsapp_polls (id, wa_message_id, question, options, allow_multiple)
        VALUES (:id, :mid, :q, :opts, :am)
    """), {"id": poll_id, "mid": msg_id, "q": body.question, "opts": json.dumps(body.options), "am": body.allow_multiple})

    await db.execute(text("UPDATE whatsapp_contacts SET last_message_at = :ts, updated_at = :ts WHERE id = :cid"), {"ts": now, "cid": contact_id})
    await db.commit()
    return {"id": msg_id, "wa_message_id": wa_message_id, "poll_id": poll_id, "status": "sent"}


# ── Number verification ──

@router.post("/check-numbers")
async def check_numbers(body: CheckNumbersBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # Verify account ownership
    acc = await db.execute(text(
        "SELECT id FROM whatsapp_accounts WHERE id = :aid AND owner_user_id = :uid AND is_active = TRUE"
    ), {"aid": body.account_id, "uid": ctx["sub"]})
    if not acc.fetchone():
        raise HTTPException(status_code=404, detail="Account not found")

    result = await wa_bridge.check_number(body.account_id, body.phone_numbers)
    results = result.get("results", [])

    # Auto-create contacts for verified numbers
    for r in results:
        if r.get("exists") and r.get("jid"):
            await db.execute(text("""
                INSERT INTO whatsapp_contacts (wa_account_id, wa_jid, phone_number, created_at)
                VALUES (:aid, :jid, :phone, NOW())
                ON CONFLICT (wa_account_id, wa_jid) DO NOTHING
            """), {"aid": body.account_id, "jid": r["jid"], "phone": r["number"]})
    await db.commit()
    return {"results": results}


# ── Online presence ──

@router.post("/conversations/{contact_id}/subscribe-presence")
async def subscribe_presence(contact_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    await wa_bridge.subscribe_presence(str(contact.wa_account_id), contact.wa_jid)
    return {"ok": True}


@router.get("/conversations/{contact_id}/presence")
async def get_presence(contact_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    result = await wa_bridge.get_presence(str(contact.wa_account_id), contact.wa_jid)
    return result


# ── Disappearing messages ──

@router.post("/conversations/{contact_id}/disappearing")
async def set_disappearing(contact_id: str, body: DisappearingBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    await wa_bridge.set_disappearing(str(contact.wa_account_id), contact.wa_jid, body.duration)
    await db.execute(text(
        "UPDATE whatsapp_contacts SET disappearing_duration = :d, updated_at = NOW() WHERE id = :cid"
    ), {"d": body.duration, "cid": contact_id})
    await db.commit()
    return {"ok": True}


# ── Group management ──

@router.post("/groups/create")
async def create_group(body: GroupCreateBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    # Use first active account
    acc = await db.execute(text(
        "SELECT id FROM whatsapp_accounts WHERE owner_user_id = :uid AND is_active = TRUE AND status = 'connected' LIMIT 1"
    ), {"uid": ctx["sub"]})
    acc_row = acc.fetchone()
    if not acc_row:
        raise HTTPException(status_code=400, detail="No connected WhatsApp account")
    result = await wa_bridge.create_group(str(acc_row.id), body.name, body.participants)
    return result


@router.get("/groups/{contact_id}/metadata")
async def get_group_metadata(contact_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    if not contact.wa_jid.endswith("@g.us"):
        raise HTTPException(status_code=400, detail="Not a group chat")
    result = await wa_bridge.get_group_metadata(str(contact.wa_account_id), contact.wa_jid)
    return result


@router.post("/groups/{contact_id}/participants/add")
async def add_participants(contact_id: str, body: GroupParticipantsBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    await wa_bridge.add_group_participants(str(contact.wa_account_id), contact.wa_jid, body.participants)
    return {"ok": True}


@router.post("/groups/{contact_id}/participants/remove")
async def remove_participants(contact_id: str, body: GroupParticipantsBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    contact = await _verify_contact_ownership(db, contact_id, ctx["sub"])
    await wa_bridge.remove_group_participants(str(contact.wa_account_id), contact.wa_jid, body.participants)
    return {"ok": True}


# ── Labels ──

@router.get("/labels")
async def list_labels(account_id: Optional[str] = None, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    if account_id:
        rows = await db.execute(text(
            "SELECT * FROM whatsapp_labels WHERE wa_account_id = :aid ORDER BY name"
        ), {"aid": account_id})
    else:
        rows = await db.execute(text("""
            SELECT wl.* FROM whatsapp_labels wl
            JOIN whatsapp_accounts wa ON wa.id = wl.wa_account_id
            WHERE wa.owner_user_id = :uid AND wa.is_active = TRUE
            ORDER BY wl.name
        """), {"uid": ctx["sub"]})
    return [dict(r._mapping) for r in rows.fetchall()]


# ── Media upload ──

@router.post("/upload-media")
async def upload_media(file: UploadFile = File(...), ctx: dict = Depends(get_current_user_with_tenant)):
    import os
    upload_dir = os.path.join("data", "wa-media", ctx["tenant_slug"])
    os.makedirs(upload_dir, exist_ok=True)
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "file")[1] or ""
    filename = f"{file_id}{ext}"
    filepath = os.path.join(upload_dir, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    # Return URL relative to backend
    media_url = f"/wa-media/{ctx['tenant_slug']}/{filename}"
    return {"media_url": media_url, "filename": file.filename, "mime_type": file.content_type, "size": len(content)}


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
    is_group: Optional[bool] = None,
    label_id: Optional[str] = None,
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
    if is_group is not None:
        q += " AND c.is_group = :ig"
        params["ig"] = is_group
    if label_id:
        q += " AND c.wa_labels @> :label_json::jsonb"
        params["label_json"] = json.dumps([label_id])

    if sort_by == "unread":
        q += " ORDER BY c.unread_count DESC, c.last_message_at DESC NULLS LAST"
    elif sort_by == "lead_status":
        q += " ORDER BY l.status, c.last_message_at DESC NULLS LAST"
    else:
        q += " ORDER BY c.last_message_at DESC NULLS LAST"

    rows = await db.execute(text(q), params)
    return [dict(r._mapping) for r in rows.fetchall()]


@router.get("/admin/conversations")
async def admin_list_conversations(
    search: Optional[str] = None,
    ctx: dict = Depends(require_admin_with_tenant),
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
    # Verify lead access for salesperson role
    if ctx.get("role") == "salesperson":
        lead_check = await db.execute(text(
            "SELECT id FROM leads WHERE id = :lid AND (assigned_to = :uid OR sales_owner_id = :uid)"
        ), {"lid": lead_id, "uid": ctx["sub"]})
        if not lead_check.fetchone():
            raise HTTPException(status_code=404, detail="Lead not found")
    rows = await db.execute(text("""
        SELECT m.*, c.display_name AS contact_name, c.phone_number AS contact_phone
        FROM whatsapp_messages m
        JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
        JOIN whatsapp_accounts a ON a.id = m.wa_account_id
        WHERE c.lead_id = :lid AND a.owner_user_id = :uid AND m.is_deleted = FALSE
        ORDER BY m.timestamp DESC
        LIMIT :lim
    """), {"lid": lead_id, "uid": ctx["sub"], "lim": min(limit, 200)})
    messages = [dict(r._mapping) for r in rows.fetchall()]
    messages.reverse()
    return messages


@router.post("/contacts/{contact_id}/link-lead")
async def link_lead(contact_id: str, body: LinkLeadBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await _verify_contact_ownership(db, contact_id, ctx["sub"])
    # Also try to find account_id from contracts linked to this lead
    acct_row = await db.execute(text(
        "SELECT account_id FROM crm_contracts WHERE lead_id = :lid AND account_id IS NOT NULL LIMIT 1"
    ), {"lid": body.lead_id})
    acct = acct_row.fetchone()
    account_id = str(acct.account_id) if acct else None
    await db.execute(
        text("UPDATE whatsapp_contacts SET lead_id = :lid, account_id = COALESCE(:aid, account_id), updated_at = NOW() WHERE id = :cid"),
        {"lid": body.lead_id, "cid": contact_id, "aid": account_id},
    )
    await db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# AI-powered conversation analysis
# ══════════════════════════════════════════════════════════════════════════════

async def _fetch_messages_text(db, contact_id: Optional[str], lead_id: Optional[str], uid: str, limit: int = 100) -> str:
    if lead_id:
        rows = await db.execute(text("""
            SELECT m.direction, m.content, m.timestamp, c.display_name
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = m.wa_account_id
            WHERE c.lead_id = :lid AND a.owner_user_id = :uid AND m.is_deleted = FALSE
            ORDER BY m.timestamp ASC LIMIT :lim
        """), {"lid": lead_id, "uid": uid, "lim": limit})
    elif contact_id:
        rows = await db.execute(text("""
            SELECT m.direction, m.content, m.timestamp
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
            WHERE m.wa_contact_id = :cid AND a.owner_user_id = :uid AND m.is_deleted = FALSE
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
    action: str


@router.post("/ai/analyze")
async def ai_analyze(body: AiAnalysisBody, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    tenant_slug = ctx.get("tenant_slug")

    chat_text = await _fetch_messages_text(db, body.contact_id, body.lead_id, ctx["sub"])
    if not chat_text:
        return {"result": "No messages found to analyze."}

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
# Bridge internal callbacks
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/internal/message-received")
async def internal_message_received(body: InternalMessageBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    now = datetime.now(timezone.utc)
    ts = body.timestamp or now.isoformat()
    direction = body.direction or "inbound"
    is_history = body.is_history_sync

    # Upsert contact
    upsert_params = {"aid": body.wa_account_id, "jid": body.wa_jid, "pn": body.push_name, "ts": ts}
    if is_history:
        # History sync: don't increment unread
        await db.execute(text("""
            INSERT INTO whatsapp_contacts (wa_account_id, wa_jid, push_name, display_name, last_message_at, unread_count, created_at)
            VALUES (:aid, :jid, :pn, :pn, :ts, 0, NOW())
            ON CONFLICT (wa_account_id, wa_jid) DO UPDATE
            SET push_name = COALESCE(EXCLUDED.push_name, whatsapp_contacts.push_name),
                last_message_at = GREATEST(whatsapp_contacts.last_message_at, EXCLUDED.last_message_at),
                updated_at = NOW()
        """), upsert_params)
    else:
        unread_inc = 1 if direction == "inbound" else 0
        await db.execute(text(f"""
            INSERT INTO whatsapp_contacts (wa_account_id, wa_jid, push_name, display_name, last_message_at, unread_count, created_at)
            VALUES (:aid, :jid, :pn, :pn, :ts, {unread_inc}, NOW())
            ON CONFLICT (wa_account_id, wa_jid) DO UPDATE
            SET push_name = COALESCE(EXCLUDED.push_name, whatsapp_contacts.push_name),
                last_message_at = EXCLUDED.last_message_at,
                unread_count = whatsapp_contacts.unread_count + {unread_inc},
                updated_at = NOW()
        """), upsert_params)

    # Update profile pic if provided
    if body.profile_pic_url:
        await db.execute(text(
            "UPDATE whatsapp_contacts SET profile_pic_url = :pic WHERE wa_account_id = :aid AND wa_jid = :jid"
        ), {"pic": body.profile_pic_url, "aid": body.wa_account_id, "jid": body.wa_jid})

    # Get contact id
    contact = await db.execute(text(
        "SELECT id, lead_id, phone_number FROM whatsapp_contacts WHERE wa_account_id = :aid AND wa_jid = :jid"
    ), {"aid": body.wa_account_id, "jid": body.wa_jid})
    contact_row = contact.fetchone()
    contact_id = str(contact_row.id) if contact_row else None

    # Auto-match to lead by phone number if not already linked
    if contact_row and not contact_row.lead_id:
        # Extract phone digits from JID (e.g., "8613800138000@s.whatsapp.net" → "8613800138000")
        raw_jid = body.wa_jid.split("@")[0] if "@" in body.wa_jid else body.wa_jid
        phone_variants = [raw_jid, f"+{raw_jid}"]
        if contact_row.phone_number:
            phone_variants.append(contact_row.phone_number)
            phone_variants.append(contact_row.phone_number.lstrip("+"))
        # Deduplicate
        phone_variants = list(set(v for v in phone_variants if v))
        if phone_variants:
            lead_match = await db.execute(text("""
                SELECT id FROM leads
                WHERE whatsapp IS NOT NULL AND whatsapp != ''
                  AND REPLACE(REPLACE(REPLACE(whatsapp, '+', ''), '-', ''), ' ', '') = ANY(:phones)
                LIMIT 1
            """), {"phones": [v.replace("+", "").replace("-", "").replace(" ", "") for v in phone_variants]})
            matched_lead = lead_match.fetchone()
            if matched_lead:
                # Also find account_id from contracts
                acct_row = await db.execute(text(
                    "SELECT account_id FROM crm_contracts WHERE lead_id = :lid AND account_id IS NOT NULL LIMIT 1"
                ), {"lid": str(matched_lead.id)})
                acct = acct_row.fetchone()
                await db.execute(text(
                    "UPDATE whatsapp_contacts SET lead_id = :lid, account_id = :aid, updated_at = NOW() WHERE id = :cid"
                ), {"lid": str(matched_lead.id), "cid": contact_id, "aid": str(acct.account_id) if acct else None})
                logger.info(f"Auto-linked WhatsApp contact {contact_id} to lead {matched_lead.id}")

    if contact_id:
        # Build metadata with wa_key
        metadata = {}
        if body.wa_key:
            metadata["wa_key"] = body.wa_key

        # Find reply_to_message_id from quoted_message_id
        reply_to = None
        if body.quoted_message_id:
            ref = await db.execute(text(
                "SELECT id FROM whatsapp_messages WHERE wa_message_id = :mid AND wa_account_id = :aid LIMIT 1"
            ), {"mid": body.quoted_message_id, "aid": body.wa_account_id})
            ref_row = ref.fetchone()
            if ref_row:
                reply_to = str(ref_row.id)
            if body.quoted_content:
                metadata["quoted_content"] = body.quoted_content

        if is_history:
            # History sync: ON CONFLICT DO NOTHING
            await db.execute(text("""
                INSERT INTO whatsapp_messages (wa_account_id, wa_contact_id, wa_message_id, direction, message_type,
                    content, media_url, media_mime_type, status, timestamp, created_at, metadata, reply_to_message_id)
                VALUES (:aid, :cid, :mid, :dir, :mtype, :content, :murl, :mmime, 'received', :ts, NOW(), :meta, :reply_to)
                ON CONFLICT DO NOTHING
            """), {
                "aid": body.wa_account_id, "cid": contact_id, "mid": body.wa_message_id,
                "dir": direction, "mtype": body.message_type, "content": body.content,
                "murl": body.media_url, "mmime": body.media_mime_type, "ts": ts,
                "meta": json.dumps(metadata), "reply_to": reply_to,
            })
        else:
            await db.execute(text("""
                INSERT INTO whatsapp_messages (wa_account_id, wa_contact_id, wa_message_id, direction, message_type,
                    content, media_url, media_mime_type, status, timestamp, created_at, metadata, reply_to_message_id)
                VALUES (:aid, :cid, :mid, :dir, :mtype, :content, :murl, :mmime, 'received', :ts, NOW(), :meta, :reply_to)
            """), {
                "aid": body.wa_account_id, "cid": contact_id, "mid": body.wa_message_id,
                "dir": direction, "mtype": body.message_type, "content": body.content,
                "murl": body.media_url, "mmime": body.media_mime_type, "ts": ts,
                "meta": json.dumps(metadata), "reply_to": reply_to,
            })

    await db.commit()
    return {"ok": True}


@router.post("/internal/status-update")
async def internal_status_update(body: InternalStatusBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    await db.execute(
        text("UPDATE whatsapp_messages SET status = :st WHERE wa_message_id = :mid"),
        {"st": body.status, "mid": body.wa_message_id},
    )
    await db.commit()
    return {"ok": True}


@router.post("/internal/auth-update")
async def internal_auth_update(body: InternalAuthBody, ctx: dict = Depends(_get_bridge_context)):
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


@router.post("/internal/reaction-received")
async def internal_reaction_received(body: InternalReactionBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    # Find the message by wa_message_id
    msg = await db.execute(text(
        "SELECT id FROM whatsapp_messages WHERE wa_message_id = :mid LIMIT 1"
    ), {"mid": body.wa_message_id})
    msg_row = msg.fetchone()
    if not msg_row:
        return {"ok": False, "reason": "message not found"}

    if body.emoji:
        await db.execute(text("""
            INSERT INTO whatsapp_reactions (wa_message_id, reactor_jid, emoji, timestamp)
            VALUES (:mid, :jid, :emoji, :ts)
            ON CONFLICT (wa_message_id, reactor_jid) DO UPDATE SET emoji = :emoji, timestamp = :ts
        """), {"mid": str(msg_row.id), "jid": body.reactor_jid, "emoji": body.emoji, "ts": body.timestamp or _now_iso()})
    else:
        # Empty emoji = remove reaction
        await db.execute(text(
            "DELETE FROM whatsapp_reactions WHERE wa_message_id = :mid AND reactor_jid = :jid"
        ), {"mid": str(msg_row.id), "jid": body.reactor_jid})
    await db.commit()
    return {"ok": True}


@router.post("/internal/message-deleted")
async def internal_message_deleted(body: InternalMessageDeletedBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    await db.execute(text("""
        UPDATE whatsapp_messages SET is_deleted = TRUE, content = NULL WHERE wa_message_id = :mid
    """), {"mid": body.wa_message_id})
    await db.commit()
    return {"ok": True}


@router.post("/internal/message-edited")
async def internal_message_edited(body: InternalMessageEditedBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    # Get old content for history
    old = await db.execute(text(
        "SELECT content, edit_history FROM whatsapp_messages WHERE wa_message_id = :mid LIMIT 1"
    ), {"mid": body.wa_message_id})
    old_row = old.fetchone()
    history = json.loads(old_row.edit_history) if old_row and old_row.edit_history else []
    if old_row and old_row.content:
        history.append({"content": old_row.content, "edited_at": body.timestamp or _now_iso()})

    await db.execute(text("""
        UPDATE whatsapp_messages SET content = :content, is_edited = TRUE, edit_history = :history
        WHERE wa_message_id = :mid
    """), {"content": body.new_content, "history": json.dumps(history), "mid": body.wa_message_id})
    await db.commit()
    return {"ok": True}


@router.post("/internal/poll-vote-received")
async def internal_poll_vote_received(body: InternalPollVoteBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    # Find poll by wa_message_id
    msg = await db.execute(text(
        "SELECT id FROM whatsapp_messages WHERE wa_message_id = :mid LIMIT 1"
    ), {"mid": body.wa_message_id})
    msg_row = msg.fetchone()
    if not msg_row:
        return {"ok": False, "reason": "message not found"}

    poll = await db.execute(text("SELECT id FROM whatsapp_polls WHERE wa_message_id = :mid"), {"mid": str(msg_row.id)})
    poll_row = poll.fetchone()
    if not poll_row:
        return {"ok": False, "reason": "poll not found"}

    await db.execute(text("""
        INSERT INTO whatsapp_poll_votes (poll_id, voter_jid, selected_options, timestamp)
        VALUES (:pid, :jid, :opts, NOW())
        ON CONFLICT (poll_id, voter_jid) DO UPDATE SET selected_options = :opts, timestamp = NOW()
    """), {"pid": str(poll_row.id), "jid": body.voter_jid, "opts": json.dumps(body.selected_options)})
    await db.commit()
    return {"ok": True}


@router.post("/internal/group-updated")
async def internal_group_updated(body: InternalGroupUpdateBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    await db.execute(text("""
        UPDATE whatsapp_contacts SET group_metadata = :meta, is_group = TRUE, updated_at = NOW()
        WHERE wa_account_id = :aid AND wa_jid = :jid
    """), {"meta": json.dumps(body.metadata), "aid": body.wa_account_id, "jid": body.group_jid})
    await db.commit()
    return {"ok": True}


@router.post("/internal/group-participants-updated")
async def internal_group_participants_updated(body: InternalGroupParticipantsBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    # Update group_metadata with participant changes
    row = await db.execute(text(
        "SELECT group_metadata FROM whatsapp_contacts WHERE wa_account_id = :aid AND wa_jid = :jid"
    ), {"aid": body.wa_account_id, "jid": body.group_jid})
    existing = row.fetchone()
    meta = json.loads(existing.group_metadata) if existing and existing.group_metadata else {}
    participants = meta.get("participants", [])

    if body.action == "add":
        for p in body.participants:
            if p not in participants:
                participants.append(p)
    elif body.action in ("remove", "leave"):
        participants = [p for p in participants if p not in body.participants]

    meta["participants"] = participants
    meta["last_update"] = _now_iso()

    await db.execute(text("""
        UPDATE whatsapp_contacts SET group_metadata = :meta, updated_at = NOW()
        WHERE wa_account_id = :aid AND wa_jid = :jid
    """), {"meta": json.dumps(meta), "aid": body.wa_account_id, "jid": body.group_jid})
    await db.commit()
    return {"ok": True}


@router.post("/internal/labels-updated")
async def internal_labels_updated(body: InternalLabelsBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    for label in body.labels:
        await db.execute(text("""
            INSERT INTO whatsapp_labels (wa_account_id, wa_label_id, name, color)
            VALUES (:aid, :lid, :name, :color)
            ON CONFLICT (wa_account_id, wa_label_id) DO UPDATE SET name = :name, color = :color
        """), {"aid": body.wa_account_id, "lid": label.get("id", ""), "name": label.get("name", ""), "color": label.get("color", "")})
    await db.commit()
    return {"ok": True}


@router.post("/internal/label-association")
async def internal_label_association(body: InternalLabelAssociationBody, ctx: dict = Depends(_get_bridge_context)):
    db = ctx["db"]
    row = await db.execute(text(
        "SELECT wa_labels FROM whatsapp_contacts WHERE wa_account_id = :aid AND wa_jid = :jid"
    ), {"aid": body.wa_account_id, "jid": body.chat_jid})
    existing = row.fetchone()
    labels = json.loads(existing.wa_labels) if existing and existing.wa_labels else []

    if body.action == "add" and body.label_id not in labels:
        labels.append(body.label_id)
    elif body.action == "remove" and body.label_id in labels:
        labels.remove(body.label_id)

    await db.execute(text(
        "UPDATE whatsapp_contacts SET wa_labels = :labels, updated_at = NOW() WHERE wa_account_id = :aid AND wa_jid = :jid"
    ), {"labels": json.dumps(labels), "aid": body.wa_account_id, "jid": body.chat_jid})
    await db.commit()
    return {"ok": True}
