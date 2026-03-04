from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import uuid
import hmac as hmac_mod
import re
import logging
from datetime import datetime, timezone

from app.deps import get_current_user_with_tenant
from app.config import settings
from app.database import AsyncSessionLocal
from app.services.mailer import build_smtp_config, send_email, email_delivery_enabled
from app.utils.sql import safe_set_search_path

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
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    conditions = ["direction = 'inbound'", "is_deleted = FALSE"]
    params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

    if search:
        conditions.append("(subject ILIKE :search OR from_email ILIKE :search OR body_text ILIKE :search)")
        params["search"] = f"%{search}%"
    if lead_id:
        conditions.append("lead_id = CAST(:lead_id AS uuid)")
        params["lead_id"] = lead_id

    where = " AND ".join(conditions)

    count_row = await db.execute(text(f"SELECT COUNT(*) FROM emails WHERE {where}"), params)
    total = count_row.scalar()

    rows = await db.execute(text(f"""
        SELECT id, from_email, from_name, to_email, subject,
               SUBSTRING(body_text, 1, 200) AS preview, status, is_read,
               lead_id, thread_id, received_at, created_at
        FROM emails WHERE {where}
        ORDER BY created_at DESC LIMIT :limit OFFSET :offset
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
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    conditions = ["direction = 'outbound'", "is_deleted = FALSE"]
    params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

    if search:
        conditions.append("(subject ILIKE :search OR to_email ILIKE :search OR body_text ILIKE :search)")
        params["search"] = f"%{search}%"

    where = " AND ".join(conditions)

    count_row = await db.execute(text(f"SELECT COUNT(*) FROM emails WHERE {where}"), params)
    total = count_row.scalar()

    rows = await db.execute(text(f"""
        SELECT id, from_email, from_name, to_email, to_name, subject,
               SUBSTRING(body_text, 1, 200) AS preview, status,
               lead_id, thread_id, sent_at, created_at
        FROM emails WHERE {where}
        ORDER BY created_at DESC LIMIT :limit OFFSET :offset
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
        SELECT e.*, u.full_name AS sender_name, l.full_name AS lead_name
        FROM emails e
        LEFT JOIN users u ON u.id = e.sender_user_id
        LEFT JOIN leads l ON l.id = e.lead_id
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


# ── Soft Delete ──────────────────────────────────────────────────────────────

@router.delete("/{email_id}")
async def delete_email(email_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    await db.execute(text("UPDATE emails SET is_deleted = TRUE WHERE id = CAST(:eid AS uuid)"), {"eid": email_id})
    await db.commit()
    return {"ok": True}
