from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import uuid
import hmac as hmac_mod
import re
import logging
from datetime import datetime, timezone

from app.deps import get_current_user_with_tenant, require_admin_with_tenant
from app.config import settings
from app.database import AsyncSessionLocal
from app.services.mailer import build_smtp_config, send_email, email_delivery_enabled
from app.services.imap_sync import sync_tenant_imap
from app.utils.sql import safe_set_search_path
from app.utils.crypto import decrypt_api_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    to_email: str
    to_name: Optional[str] = None
    cc: Optional[str] = None
    bcc: Optional[str] = None
    subject: str
    body_text: Optional[str] = None
    body_html: Optional[str] = None
    in_reply_to_id: Optional[str] = None  # UUID of email being replied to
    lead_id: Optional[str] = None
    account_id: Optional[str] = None


class LinkRequest(BaseModel):
    lead_id: Optional[str] = None
    account_id: Optional[str] = None


class UpdateEmailStateRequest(BaseModel):
    mailbox_state: Optional[str] = None  # inbox | archived
    follow_up_state: Optional[str] = None  # none | pending | done
    follow_up_at: Optional[str] = None
    assigned_to: Optional[str] = None


class BatchUpdateEmailStateRequest(BaseModel):
    email_ids: list[str]
    mailbox_state: Optional[str] = None
    follow_up_state: Optional[str] = None
    follow_up_at: Optional[str] = None
    assigned_to: Optional[str] = None


class EmailTemplateRequest(BaseModel):
    name: str
    category: Optional[str] = "general"
    locale: Optional[str] = "en"
    subject: str
    body_text: str
    is_active: bool = True


class EmailAIWriteRequest(BaseModel):
    draft_text: Optional[str] = ""
    to_email: Optional[str] = None
    subject: Optional[str] = None
    target_language: Optional[str] = "en"


class EmailAIPolishRequest(BaseModel):
    text: str
    style: Optional[str] = "professional"
    target_language: Optional[str] = "en"


def _email_lang_instruction(lang: str) -> str:
    """Return explicit language instruction for AI prompts."""
    v = (lang or "").strip().lower().replace("_", "-")
    if v.startswith("zh-tw") or v.startswith("zh-hk") or v.startswith("zh-hant"):
        return "Use Traditional Chinese (繁體中文) for the entire response."
    if v.startswith("zh"):
        return "Use Simplified Chinese (简体中文) for the entire response."
    if v.startswith("es"):
        return "Use Spanish for the entire response."
    if v.startswith("pt"):
        return "Use Portuguese for the entire response."
    if v.startswith("it"):
        return "Use Italian for the entire response."
    if v.startswith("ja"):
        return "Use Japanese (日本語) for the entire response."
    if v.startswith("fr"):
        return "Use French for the entire response."
    if v.startswith("de"):
        return "Use German for the entire response."
    if v.startswith("ar"):
        return "Use Arabic for the entire response."
    if v.startswith("ru"):
        return "Use Russian for the entire response."
    return "Use English for the entire response."


# ── Send Email ───────────────────────────────────────────────────────────────

@router.post("/send")
async def send_email_endpoint(body: SendEmailRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    uid = ctx["sub"]
    tenant_slug = ctx["tenant_slug"]

    smtp_config = build_smtp_config()
    if not email_delivery_enabled(smtp_config):
        raise HTTPException(status_code=400, detail="Email delivery is not configured")

    email_id = str(uuid.uuid4())
    message_id = f"<{email_id}@{tenant_slug}.nexus-erp>"

    # Threading: if replying, look up original email
    thread_id = email_id  # new thread by default
    in_reply_to_header = None
    references_header = None

    if body.in_reply_to_id:
        orig = await db.execute(text("""
            SELECT message_id_header, thread_id, references_header
            FROM emails WHERE id = CAST(:eid AS uuid) AND is_deleted = FALSE
        """), {"eid": body.in_reply_to_id})
        orig_row = orig.fetchone()
        if orig_row:
            thread_id = str(orig_row.thread_id) if orig_row.thread_id else body.in_reply_to_id
            in_reply_to_header = orig_row.message_id_header
            refs = orig_row.references_header or ""
            if orig_row.message_id_header:
                refs = f"{refs} {orig_row.message_id_header}".strip()
            references_header = refs or None

    # Get sender info
    user_row = await db.execute(text("SELECT full_name, email FROM users WHERE id = CAST(:uid AS uuid)"), {"uid": uid})
    user = user_row.fetchone()
    from_name = user.full_name if user else None

    # Send via SMTP
    success, status_msg, mid = await send_email(
        smtp_config,
        body.to_email,
        body.subject,
        body.body_text or "",
        body.body_html,
        cc=body.cc,
        bcc=body.bcc,
        message_id=message_id,
        in_reply_to=in_reply_to_header,
        references=references_header,
    )

    status = "sent" if success else "failed"
    error_msg = None if success else status_msg
    now = datetime.now(timezone.utc)

    # Insert into emails table
    await db.execute(text("""
        INSERT INTO emails (
            id, direction, from_email, from_name, to_email, to_name,
            cc, bcc, subject, body_text, body_html,
            status, error_message,
            message_id_header, in_reply_to, references_header, thread_id,
            lead_id, account_id, sender_user_id,
            smtp_config_source, sent_at, created_at
        ) VALUES (
            CAST(:id AS uuid), 'outbound', :from_email, :from_name, :to_email, :to_name,
            :cc, :bcc, :subject, :body_text, :body_html,
            :status, :error_message,
            :message_id_header, :in_reply_to, :references_header, CAST(:thread_id AS uuid),
            :lead_id, :account_id, CAST(:sender_user_id AS uuid),
            'system', :sent_at, :created_at
        )
    """), {
        "id": email_id,
        "from_email": smtp_config.smtp_from_email,
        "from_name": from_name or smtp_config.smtp_from_name,
        "to_email": body.to_email,
        "to_name": body.to_name,
        "cc": body.cc,
        "bcc": body.bcc,
        "subject": body.subject,
        "body_text": body.body_text,
        "body_html": body.body_html,
        "status": status,
        "error_message": error_msg,
        "message_id_header": message_id,
        "in_reply_to": in_reply_to_header,
        "references_header": references_header,
        "thread_id": thread_id,
        "lead_id": body.lead_id if body.lead_id else None,
        "account_id": body.account_id if body.account_id else None,
        "sender_user_id": uid,
        "sent_at": now,
        "created_at": now,
    })
    await db.commit()

    if not success:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {status_msg}")

    return {"id": email_id, "status": status, "message_id": message_id, "thread_id": thread_id}


# ── AI Assist ────────────────────────────────────────────────────────────────

@router.post("/ai/write")
async def ai_write_email(body: EmailAIWriteRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    tenant_ref = ctx.get("tenant_id") or ctx.get("tenant_slug")
    target_lang = (body.target_language or "en").strip() or "en"
    draft = (body.draft_text or "").strip()
    to_email = (body.to_email or "").strip()
    subject = (body.subject or "").strip()

    lang_instruction = _email_lang_instruction(target_lang)
    prompt = f"""
You are an expert business email assistant.
Task: generate a complete, polished email body based on the user's draft and intent.

Output rules:
- Return body text only (no markdown fences, no explanation).
- Keep paragraph formatting clean and readable.
- Keep placeholders/numbers/emails exactly when possible.
- {lang_instruction}

Context:
- To: {to_email or "(not provided)"}
- Subject: {subject or "(not provided)"}
- Draft:
{draft or "(empty draft)"}
"""
    try:
        from app.services.ai.provider import generate_text_for_tenant
        result = await generate_text_for_tenant(
            db,
            tenant_ref,
            prompt,
            system_instruction="You write clear, concise professional emails. Return only the final email body.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI write failed: {e}")

    return {"result": (result or "").strip()}


@router.post("/ai/polish")
async def ai_polish_text(body: EmailAIPolishRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    tenant_ref = ctx.get("tenant_id") or ctx.get("tenant_slug")
    src = (body.text or "").strip()
    if not src:
        raise HTTPException(status_code=400, detail="text is required")

    target_lang = (body.target_language or "en").strip() or "en"
    style = (body.style or "professional").strip() or "professional"

    lang_instruction = _email_lang_instruction(target_lang)
    prompt = f"""
Polish the following selected email text.

Requirements:
- Preserve original meaning and facts.
- Improve clarity, fluency, and tone.
- Keep it concise and natural.
- Style: {style}
- {lang_instruction}
- Return only the polished text.

Text:
{src}
"""
    try:
        from app.services.ai.provider import generate_text_for_tenant
        result = await generate_text_for_tenant(
            db,
            tenant_ref,
            prompt,
            system_instruction="You are a writing editor. Return only polished text.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI polish failed: {e}")

    return {"result": (result or "").strip()}


# ── Webhook: Inbound Email ───────────────────────────────────────────────────

@router.post("/webhook/inbound")
async def inbound_email_webhook(request: Request):
    """Receive inbound emails from SendGrid/Mailgun webhook. No JWT — uses secret."""
    secret = request.query_params.get("secret", "")
    if not settings.email_webhook_secret or not hmac_mod.compare_digest(
        secret.encode(), settings.email_webhook_secret.encode()
    ):
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        data = dict(form)
    else:
        data = await request.json()

    # Parse inbound email fields (SendGrid / Mailgun compatible)
    raw_from = data.get("from", data.get("sender", "")) or ""
    to_email = data.get("to", data.get("recipient", "")) or ""
    subject = data.get("subject", "") or ""
    body_text = data.get("text", data.get("body-plain", "")) or ""
    body_html = data.get("html", data.get("body-html", "")) or ""
    msg_id_header = data.get("Message-ID", data.get("Message-Id", data.get("message-id", ""))) or ""
    in_reply_to = data.get("In-Reply-To", data.get("in-reply-to", "")) or ""
    references = data.get("References", data.get("references", "")) or ""

    # Parse from_name from "Name <email>" format
    from_email = raw_from
    from_name = None
    _addr_match = re.match(r'^(.+?)\s*<([^>]+)>', raw_from)
    if _addr_match:
        from_name = _addr_match.group(1).strip().strip('"')
        from_email = _addr_match.group(2)

    email_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # Thread matching: find existing email by In-Reply-To
    thread_id = email_id
    async with AsyncSessionLocal() as db:
        try:
            # Determine tenant from to_email — try all tenant schemas
            tenants_result = await db.execute(text(
                "SELECT slug FROM platform.tenants WHERE is_active = TRUE AND schema_provisioned = TRUE"
            ))
            tenant_slugs = [r.slug for r in tenants_result.fetchall()]

            matched_tenant = None
            for slug in tenant_slugs:
                try:
                    await safe_set_search_path(db, slug)

                    # Thread matching
                    if in_reply_to:
                        orig = await db.execute(text("""
                            SELECT thread_id FROM emails WHERE message_id_header = :mid AND is_deleted = FALSE LIMIT 1
                        """), {"mid": in_reply_to})
                        orig_row = orig.fetchone()
                        if orig_row:
                            thread_id = str(orig_row.thread_id) if orig_row.thread_id else thread_id
                            matched_tenant = slug
                            break

                    # Try matching by from_email to a lead
                    lead_match = await db.execute(text("""
                        SELECT id FROM leads WHERE email = :email LIMIT 1
                    """), {"email": from_email})
                    if lead_match.fetchone():
                        matched_tenant = slug
                        break
                except Exception as e:
                    logger.warning("email-webhook: error checking tenant %s: %s", slug, e)
                    continue

            if not matched_tenant:
                logger.warning("email-webhook: no tenant matched for from=%s to=%s", from_email, to_email)
                return {"status": "ok", "id": email_id, "note": "no matching tenant"}

            await safe_set_search_path(db, matched_tenant)

            # Auto-link to lead by from_email
            lead_id = None
            lead_row = await db.execute(text("SELECT id FROM leads WHERE email = :email LIMIT 1"), {"email": from_email})
            lead = lead_row.fetchone()
            if lead:
                lead_id = str(lead.id)

            await db.execute(text("""
                INSERT INTO emails (
                    id, direction, from_email, from_name, to_email, to_name,
                    subject, body_text, body_html,
                    status, message_id_header, in_reply_to, references_header, thread_id,
                    lead_id, webhook_provider, received_at, created_at
                ) VALUES (
                    CAST(:id AS uuid), 'inbound', :from_email, :from_name, :to_email, NULL,
                    :subject, :body_text, :body_html,
                    'received', :message_id_header, :in_reply_to, :references_header, CAST(:thread_id AS uuid),
                    :lead_id, :webhook_provider, :received_at, :created_at
                )
                ON CONFLICT DO NOTHING
            """), {
                "id": email_id,
                "from_email": from_email,
                "from_name": from_name,
                "to_email": to_email,
                "subject": subject,
                "body_text": body_text,
                "body_html": body_html,
                "message_id_header": msg_id_header or None,
                "in_reply_to": in_reply_to or None,
                "references_header": references or None,
                "thread_id": thread_id,
                "lead_id": lead_id,
                "webhook_provider": settings.email_inbound_provider,
                "received_at": now,
                "created_at": now,
            })
            await db.commit()
        finally:
            # Reset search_path to prevent connection pool contamination
            await db.execute(text("SET search_path TO public"))

    return {"status": "ok", "id": email_id}


# ── Inbox / Sent ─────────────────────────────────────────────────────────────

@router.get("/inbox")
async def list_inbox(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    lead_id: Optional[str] = None,
    mailbox_state: Optional[str] = None,
    include_outbound: bool = Query(False),
    unread_only: bool = Query(False),
    follow_up_only: bool = Query(False),
    assigned_to: Optional[str] = None,
    unlinked_only: bool = Query(False),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    conditions = ["is_deleted = FALSE"]
    params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

    if not include_outbound:
        conditions.append("direction = 'inbound'")

    if search:
        conditions.append("(subject ILIKE :search OR from_email ILIKE :search OR body_text ILIKE :search)")
        params["search"] = f"%{search}%"
    if lead_id:
        conditions.append("lead_id = CAST(:lead_id AS uuid)")
        params["lead_id"] = lead_id
    if mailbox_state:
        conditions.append("COALESCE(mailbox_state, 'inbox') = :mailbox_state")
        params["mailbox_state"] = mailbox_state
    else:
        conditions.append("COALESCE(mailbox_state, 'inbox') != 'archived'")
    if unread_only:
        conditions.append("is_read = FALSE")
    if follow_up_only:
        conditions.append("COALESCE(follow_up_state, 'none') = 'pending'")
    if assigned_to:
        conditions.append("assigned_to = CAST(:assigned_to AS uuid)")
        params["assigned_to"] = assigned_to
    if unlinked_only:
        conditions.append("lead_id IS NULL AND account_id IS NULL")

    where = " AND ".join(conditions)

    count_row = await db.execute(text(f"SELECT COUNT(*) FROM emails WHERE {where}"), params)
    total = count_row.scalar()

    rows = await db.execute(text(f"""
        SELECT e.id, e.from_email, e.from_name, e.to_email, e.subject,
               e.direction,
               SUBSTRING(e.body_text, 1, 200) AS preview, e.status, e.is_read,
               e.lead_id, e.thread_id, e.received_at, e.created_at,
               COALESCE(e.mailbox_state, 'inbox') AS mailbox_state,
               COALESCE(e.follow_up_state, 'none') AS follow_up_state,
               e.follow_up_at, e.assigned_to, u.full_name AS assigned_user_name
        FROM emails e
        LEFT JOIN users u ON u.id = e.assigned_to
        WHERE {where}
        ORDER BY e.created_at DESC LIMIT :limit OFFSET :offset
    """), params)

    return {
        "items": [dict(r._mapping) for r in rows.fetchall()],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/sent")
async def list_sent(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    mailbox_state: Optional[str] = None,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    conditions = ["direction = 'outbound'", "is_deleted = FALSE"]
    params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

    if search:
        conditions.append("(subject ILIKE :search OR to_email ILIKE :search OR body_text ILIKE :search)")
        params["search"] = f"%{search}%"
    if mailbox_state:
        conditions.append("COALESCE(mailbox_state, 'inbox') = :mailbox_state")
        params["mailbox_state"] = mailbox_state
    else:
        conditions.append("COALESCE(mailbox_state, 'inbox') != 'archived'")

    where = " AND ".join(conditions)

    count_row = await db.execute(text(f"SELECT COUNT(*) FROM emails WHERE {where}"), params)
    total = count_row.scalar()

    rows = await db.execute(text(f"""
        SELECT e.id, e.from_email, e.from_name, e.to_email, e.to_name, e.subject,
               SUBSTRING(e.body_text, 1, 200) AS preview, e.status,
               e.lead_id, e.thread_id, e.sent_at, e.created_at,
               COALESCE(e.mailbox_state, 'inbox') AS mailbox_state,
               COALESCE(e.follow_up_state, 'none') AS follow_up_state,
               e.follow_up_at, e.assigned_to, u.full_name AS assigned_user_name
        FROM emails e
        LEFT JOIN users u ON u.id = e.assigned_to
        WHERE {where}
        ORDER BY e.created_at DESC LIMIT :limit OFFSET :offset
    """), params)

    return {
        "items": [dict(r._mapping) for r in rows.fetchall()],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── Unread Count (must be before /{email_id} to avoid route conflict) ────────

@router.get("/unread-count")
async def unread_email_count(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(text(
        "SELECT COUNT(*) FROM emails WHERE direction = 'inbound' AND is_read = FALSE AND is_deleted = FALSE"
    ))
    return {"count": row.scalar()}


# ── Thread ───────────────────────────────────────────────────────────────────

@router.get("/thread/{thread_id}")
async def get_email_thread(thread_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    rows = await db.execute(text("""
        SELECT e.*, u.full_name AS sender_name, l.full_name AS lead_name
        FROM emails e
        LEFT JOIN users u ON u.id = e.sender_user_id
        LEFT JOIN leads l ON l.id = e.lead_id
        WHERE e.thread_id = CAST(:tid AS uuid) AND e.is_deleted = FALSE
        ORDER BY e.created_at ASC
    """), {"tid": thread_id})
    return {"emails": [dict(r._mapping) for r in rows.fetchall()]}


# ── Single Email Detail ──────────────────────────────────────────────────────

@router.get("/{email_id}")
async def get_email_detail(email_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    row = await db.execute(text("""
        SELECT e.*, u.full_name AS sender_name, l.full_name AS lead_name, au.full_name AS assigned_user_name
        FROM emails e
        LEFT JOIN users u ON u.id = e.sender_user_id
        LEFT JOIN leads l ON l.id = e.lead_id
        LEFT JOIN users au ON au.id = e.assigned_to
        WHERE e.id = CAST(:eid AS uuid) AND e.is_deleted = FALSE
    """), {"eid": email_id})
    email = row.fetchone()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    # Auto-mark as read
    if not email.is_read:
        await db.execute(text("UPDATE emails SET is_read = TRUE WHERE id = CAST(:eid AS uuid)"), {"eid": email_id})
        await db.commit()

    return dict(email._mapping)


# ── Link to Customer ─────────────────────────────────────────────────────────

@router.patch("/{email_id}/link")
async def link_email(email_id: str, body: LinkRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    sets = []
    params = {"eid": email_id}

    if body.lead_id is not None:
        sets.append("lead_id = CAST(:lead_id AS uuid)" if body.lead_id else "lead_id = NULL")
        if body.lead_id:
            params["lead_id"] = body.lead_id
    if body.account_id is not None:
        sets.append("account_id = CAST(:account_id AS uuid)" if body.account_id else "account_id = NULL")
        if body.account_id:
            params["account_id"] = body.account_id

    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.execute(text(f"UPDATE emails SET {', '.join(sets)} WHERE id = CAST(:eid AS uuid)"), params)
    await db.commit()
    return {"ok": True}


# ── Mark Read ────────────────────────────────────────────────────────────────

@router.patch("/{email_id}/read")
async def mark_email_read(email_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await db.execute(text("UPDATE emails SET is_read = TRUE WHERE id = CAST(:eid AS uuid)"), {"eid": email_id})
    await db.commit()
    return {"ok": True}


# ── Email Workflow State ─────────────────────────────────────────────────────

@router.patch("/{email_id}/state")
async def update_email_state(email_id: str, body: UpdateEmailStateRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    sets: list[str] = []
    params: dict = {"eid": email_id}

    if body.mailbox_state is not None:
        if body.mailbox_state not in {"inbox", "archived"}:
            raise HTTPException(status_code=400, detail="Invalid mailbox_state")
        sets.append("mailbox_state = :mailbox_state")
        params["mailbox_state"] = body.mailbox_state
    if body.follow_up_state is not None:
        if body.follow_up_state not in {"none", "pending", "done"}:
            raise HTTPException(status_code=400, detail="Invalid follow_up_state")
        sets.append("follow_up_state = :follow_up_state")
        params["follow_up_state"] = body.follow_up_state
    if body.follow_up_at is not None:
        if body.follow_up_at.strip() == "":
            sets.append("follow_up_at = NULL")
        else:
            sets.append("follow_up_at = CAST(:follow_up_at AS timestamptz)")
            params["follow_up_at"] = body.follow_up_at
    if body.assigned_to is not None:
        if body.assigned_to.strip() == "":
            sets.append("assigned_to = NULL")
        else:
            sets.append("assigned_to = CAST(:assigned_to AS uuid)")
            params["assigned_to"] = body.assigned_to

    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.execute(text(f"UPDATE emails SET {', '.join(sets)} WHERE id = CAST(:eid AS uuid)"), params)
    await db.commit()
    return {"ok": True}


@router.post("/batch/state")
async def batch_update_email_state(body: BatchUpdateEmailStateRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    if not body.email_ids:
        raise HTTPException(status_code=400, detail="email_ids is required")

    sets: list[str] = []
    params: dict = {"ids": body.email_ids}

    if body.mailbox_state is not None:
        if body.mailbox_state not in {"inbox", "archived"}:
            raise HTTPException(status_code=400, detail="Invalid mailbox_state")
        sets.append("mailbox_state = :mailbox_state")
        params["mailbox_state"] = body.mailbox_state
    if body.follow_up_state is not None:
        if body.follow_up_state not in {"none", "pending", "done"}:
            raise HTTPException(status_code=400, detail="Invalid follow_up_state")
        sets.append("follow_up_state = :follow_up_state")
        params["follow_up_state"] = body.follow_up_state
    if body.follow_up_at is not None:
        if body.follow_up_at.strip() == "":
            sets.append("follow_up_at = NULL")
        else:
            sets.append("follow_up_at = CAST(:follow_up_at AS timestamptz)")
            params["follow_up_at"] = body.follow_up_at
    if body.assigned_to is not None:
        if body.assigned_to.strip() == "":
            sets.append("assigned_to = NULL")
        else:
            sets.append("assigned_to = CAST(:assigned_to AS uuid)")
            params["assigned_to"] = body.assigned_to

    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.execute(text(f"""
        UPDATE emails
        SET {', '.join(sets)}
        WHERE id::text = ANY(:ids)
    """), params)
    await db.commit()
    return {"ok": True}


# ── Email Templates ──────────────────────────────────────────────────────────

@router.get("/manage/templates")
async def list_email_templates(
    locale: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = Query(True),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    params: dict = {}
    conditions = ["is_deleted = FALSE"]
    if active_only:
        conditions.append("is_active = TRUE")
    if locale:
        conditions.append("locale = :locale")
        params["locale"] = locale
    if category:
        conditions.append("category = :category")
        params["category"] = category

    where = " AND ".join(conditions)
    rows = await db.execute(text(f"""
        SELECT id, name, category, locale, subject, body_text, is_active, created_at, updated_at
        FROM email_templates
        WHERE {where}
        ORDER BY created_at DESC
    """), params)
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/manage/templates")
async def create_email_template(body: EmailTemplateRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.execute(text("""
        INSERT INTO email_templates (
            id, name, category, locale, subject, body_text, is_active, created_by, created_at, updated_at
        ) VALUES (
            CAST(:id AS uuid), :name, :category, :locale, :subject, :body_text, :is_active, CAST(:created_by AS uuid), :created_at, :updated_at
        )
    """), {
        "id": tid,
        "name": body.name.strip(),
        "category": (body.category or "general").strip() or "general",
        "locale": (body.locale or "en").strip() or "en",
        "subject": body.subject.strip(),
        "body_text": body.body_text,
        "is_active": body.is_active,
        "created_by": ctx["sub"],
        "created_at": now,
        "updated_at": now,
    })
    await db.commit()
    return {"id": tid, "ok": True}


@router.put("/manage/templates/{template_id}")
async def update_email_template(template_id: str, body: EmailTemplateRequest, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    now = datetime.now(timezone.utc)
    await db.execute(text("""
        UPDATE email_templates
        SET name = :name,
            category = :category,
            locale = :locale,
            subject = :subject,
            body_text = :body_text,
            is_active = :is_active,
            updated_at = :updated_at
        WHERE id = CAST(:id AS uuid) AND is_deleted = FALSE
    """), {
        "id": template_id,
        "name": body.name.strip(),
        "category": (body.category or "general").strip() or "general",
        "locale": (body.locale or "en").strip() or "en",
        "subject": body.subject.strip(),
        "body_text": body.body_text,
        "is_active": body.is_active,
        "updated_at": now,
    })
    await db.commit()
    return {"ok": True}


@router.delete("/manage/templates/{template_id}")
async def delete_email_template(template_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await db.execute(text("""
        UPDATE email_templates
        SET is_deleted = TRUE, updated_at = NOW()
        WHERE id = CAST(:id AS uuid)
    """), {"id": template_id})
    await db.commit()
    return {"ok": True}


# ── SLA & Triage ─────────────────────────────────────────────────────────────

@router.get("/sla/overdue")
async def list_sla_overdue(
    hours: int = Query(24, ge=1, le=240),
    limit: int = Query(100, ge=1, le=500),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    rows = await db.execute(text("""
        SELECT e.id, e.thread_id, e.subject, e.from_email, e.from_name, e.created_at, e.assigned_to,
               l.full_name AS lead_name
        FROM emails e
        LEFT JOIN leads l ON l.id = e.lead_id
        WHERE e.is_deleted = FALSE
          AND e.direction = 'inbound'
          AND e.is_read = FALSE
          AND COALESCE(e.mailbox_state, 'inbox') != 'archived'
          AND e.created_at <= (NOW() - make_interval(hours => :hours))
          AND NOT EXISTS (
              SELECT 1 FROM emails o
              WHERE o.thread_id = e.thread_id
                AND o.direction = 'outbound'
                AND o.is_deleted = FALSE
                AND o.created_at > e.created_at
          )
        ORDER BY e.created_at ASC
        LIMIT :limit
    """), {"hours": hours, "limit": limit})
    return [dict(r._mapping) for r in rows.fetchall()]


@router.post("/sla/notify")
async def notify_sla_overdue(
    hours: int = Query(24, ge=1, le=240),
    limit: int = Query(100, ge=1, le=500),
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    tenant_slug = ctx.get("tenant_slug", "")
    rows = await db.execute(text("""
        SELECT e.id, e.subject, e.from_email, e.created_at, e.assigned_to
        FROM emails e
        WHERE e.is_deleted = FALSE
          AND e.direction = 'inbound'
          AND e.is_read = FALSE
          AND COALESCE(e.mailbox_state, 'inbox') != 'archived'
          AND e.created_at <= (NOW() - make_interval(hours => :hours))
          AND NOT EXISTS (
              SELECT 1 FROM emails o
              WHERE o.thread_id = e.thread_id
                AND o.direction = 'outbound'
                AND o.is_deleted = FALSE
                AND o.created_at > e.created_at
          )
        ORDER BY e.created_at ASC
        LIMIT :limit
    """), {"hours": hours, "limit": limit})
    overdue = rows.fetchall()
    if not overdue:
        return {"ok": True, "notified": 0}

    sender_id = ctx["sub"]
    notified = 0
    for row in overdue:
        target_user = str(row.assigned_to) if row.assigned_to else sender_id
        title = "邮件超时未回复" if tenant_slug else "Email Overdue"
        body = f"{row.from_email} 的邮件超过 {hours} 小时未回复：{(row.subject or '(No Subject)')[:120]}"
        await db.execute(text("""
            INSERT INTO notifications (user_id, title, body, type, link, sender_id, created_at)
            VALUES (CAST(:uid AS uuid), :title, :body, 'email_sla', :link, CAST(:sender_id AS uuid), NOW())
        """), {
            "uid": target_user,
            "title": title,
            "body": body,
            "link": f"/{tenant_slug}/messages?tab=email" if tenant_slug else "/messages?tab=email",
            "sender_id": sender_id,
        })
        notified += 1
    await db.commit()
    return {"ok": True, "notified": notified}


# ── Soft Delete ──────────────────────────────────────────────────────────────

@router.delete("/{email_id}")
async def delete_email(email_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await db.execute(text("UPDATE emails SET is_deleted = TRUE WHERE id = CAST(:eid AS uuid)"), {"eid": email_id})
    await db.commit()
    return {"ok": True}


# ── IMAP Sync ─────────────────────────────────────────────────────────────────

@router.post("/imap/sync")
async def imap_sync_now(ctx: dict = Depends(require_admin_with_tenant)):
    """Manually trigger IMAP sync for this tenant."""
    db = ctx["db"]
    tenant_slug = ctx["tenant_slug"]
    result = await db.execute(text("""
        SELECT imap_enabled, imap_host, imap_port, imap_username,
               imap_password, imap_password_encrypted, imap_use_ssl,
               imap_mailbox, imap_timeout_seconds, imap_last_sync_at
        FROM platform.tenants WHERE slug = :slug
    """), {"slug": tenant_slug})
    row = result.fetchone()
    if not row or not row.imap_enabled:
        raise HTTPException(status_code=400, detail="IMAP is not enabled")

    imap_password = ""
    if row.imap_password_encrypted:
        try:
            imap_password = decrypt_api_key(row.imap_password_encrypted)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to decrypt IMAP password")
    elif row.imap_password:
        # Backward compatibility for legacy plaintext rows.
        imap_password = row.imap_password

    imap_config = {
        "imap_host": row.imap_host,
        "imap_port": row.imap_port,
        "imap_username": row.imap_username,
        "imap_password": imap_password,
        "imap_use_ssl": row.imap_use_ssl,
        "imap_mailbox": row.imap_mailbox,
        "imap_timeout_seconds": row.imap_timeout_seconds,
        "imap_last_sync_at": row.imap_last_sync_at,
    }
    sync_result = await sync_tenant_imap(tenant_slug, imap_config, db)
    return sync_result


@router.get("/imap/status")
async def imap_status(ctx: dict = Depends(require_admin_with_tenant)):
    """Return IMAP sync status for the current tenant."""
    db = ctx["db"]
    result = await db.execute(text("""
        SELECT imap_enabled, imap_last_sync_at, imap_timeout_seconds
        FROM platform.tenants WHERE slug = :slug
    """), {"slug": ctx["tenant_slug"]})
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "imap_enabled": bool(row.imap_enabled),
        "imap_timeout_seconds": row.imap_timeout_seconds or 30,
        "last_sync_at": row.imap_last_sync_at.isoformat() if row.imap_last_sync_at else None,
    }
