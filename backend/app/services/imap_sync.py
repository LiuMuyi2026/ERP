"""IMAP sync service — pull emails from tenant IMAP servers into the emails table."""

import asyncio
import imaplib
import email as email_lib
import email.header
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.sql import safe_set_search_path

logger = logging.getLogger(__name__)

_ADDR_RE = re.compile(r'^(.+?)\s*<([^>]+)>')


def _decode_header(raw: str | None) -> str:
    """Decode RFC 2047 encoded header value."""
    if not raw:
        return ""
    parts = email_lib.header.decode_header(raw)
    decoded = []
    for data, charset in parts:
        if isinstance(data, bytes):
            decoded.append(data.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(data)
    return " ".join(decoded)


def _parse_addr(raw: str) -> tuple[str, str | None]:
    """Parse 'Name <email>' → (email, name)."""
    raw = _decode_header(raw)
    m = _ADDR_RE.match(raw)
    if m:
        return m.group(2).strip(), m.group(1).strip().strip('"')
    return raw.strip(), None


def _get_body(msg: email_lib.message.Message) -> tuple[str, str]:
    """Extract plain text and HTML body from an email message."""
    body_text = ""
    body_html = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if part.get_content_disposition() == "attachment":
                continue
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            charset = part.get_content_charset() or "utf-8"
            decoded = payload.decode(charset, errors="replace")
            if ct == "text/plain" and not body_text:
                body_text = decoded
            elif ct == "text/html" and not body_html:
                body_html = decoded
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            decoded = payload.decode(charset, errors="replace")
            if msg.get_content_type() == "text/html":
                body_html = decoded
            else:
                body_text = decoded
    return body_text, body_html


def _imap_fetch_blocking(
    host: str,
    port: int,
    username: str,
    password: str,
    use_ssl: bool,
    mailbox: str,
    since_date: str | None,
    timeout_seconds: int,
    fetch_limit: int,
) -> list[bytes]:
    """Blocking IMAP fetch — runs in asyncio.to_thread."""
    if use_ssl:
        conn = imaplib.IMAP4_SSL(host, port, timeout=timeout_seconds)
    else:
        conn = imaplib.IMAP4(host, port, timeout=timeout_seconds)
    try:
        status, _ = conn.login(username, password)
        if status != "OK":
            raise RuntimeError("IMAP login failed")

        status, _ = conn.select(mailbox, readonly=True)
        if status != "OK":
            raise RuntimeError(f"IMAP mailbox not available: {mailbox}")

        if since_date:
            status, msg_nums = conn.search(None, f'(SINCE {since_date})')
        else:
            status, msg_nums = conn.search(None, "ALL")
        if status != "OK":
            raise RuntimeError("IMAP search failed")

        ids = msg_nums[0].split() if msg_nums[0] else []
        ids = ids[-fetch_limit:]
        raw_messages: list[bytes] = []
        for num in ids:
            status, data = conn.fetch(num, "(RFC822)")
            if status != "OK":
                continue
            if data and data[0] and isinstance(data[0], tuple):
                raw_messages.append(data[0][1])
        return raw_messages
    finally:
        try:
            conn.close()
        except Exception:
            pass
        try:
            conn.logout()
        except Exception:
            pass


async def sync_tenant_imap(
    tenant_slug: str,
    imap_config: dict,
    db: AsyncSession,
) -> dict:
    """Sync emails from IMAP for a single tenant. Returns {synced, errors}."""
    host = imap_config.get("imap_host") or ""
    port = imap_config.get("imap_port") or 993
    username = imap_config.get("imap_username") or ""
    password = imap_config.get("imap_password") or ""
    use_ssl = imap_config.get("imap_use_ssl", True)
    mailbox = imap_config.get("imap_mailbox") or "INBOX"
    timeout_seconds = int(imap_config.get("imap_timeout_seconds") or 30)
    timeout_seconds = max(5, min(timeout_seconds, 120))
    fetch_limit = int(imap_config.get("imap_fetch_limit") or 500)
    fetch_limit = max(50, min(fetch_limit, 2000))
    last_sync = imap_config.get("imap_last_sync_at")

    if not host or not username or not password:
        return {"synced": 0, "errors": ["IMAP not fully configured"]}

    # Compute SINCE date for IMAP SEARCH
    since_date = None
    if last_sync:
        if isinstance(last_sync, str):
            dt = datetime.fromisoformat(last_sync.replace("Z", "+00:00"))
        else:
            dt = last_sync
        # Go back 1 day to avoid timezone edge cases
        since_dt = dt - timedelta(days=1)
        since_date = since_dt.strftime("%d-%b-%Y")
    else:
        # First sync: last 30 days
        since_dt = datetime.now(timezone.utc) - timedelta(days=30)
        since_date = since_dt.strftime("%d-%b-%Y")

    # Fetch from IMAP in a thread
    try:
        raw_messages = await asyncio.wait_for(
            asyncio.to_thread(
                _imap_fetch_blocking,
                host, port, username, password, use_ssl, mailbox, since_date, timeout_seconds, fetch_limit,
            ),
            timeout=timeout_seconds + 10,
        )
    except asyncio.TimeoutError:
        logger.error("IMAP fetch timed out for tenant %s", tenant_slug)
        return {"synced": 0, "errors": [f"IMAP timeout after {timeout_seconds}s"]}
    except Exception as e:
        logger.error("IMAP fetch failed for tenant %s: %s", tenant_slug, e)
        return {"synced": 0, "errors": [str(e)]}

    await safe_set_search_path(db, tenant_slug)

    synced = 0
    errors: list[str] = []
    now = datetime.now(timezone.utc)

    for raw in raw_messages:
        try:
            msg = email_lib.message_from_bytes(raw)
            msg_id_header = _decode_header(msg.get("Message-ID", "")).strip()
            if not msg_id_header:
                continue

            from_email, from_name = _parse_addr(msg.get("From", ""))
            to_email = _decode_header(msg.get("To", ""))
            subject = _decode_header(msg.get("Subject", ""))
            in_reply_to = _decode_header(msg.get("In-Reply-To", "")).strip() or None
            references = _decode_header(msg.get("References", "")).strip() or None
            body_text, body_html = _get_body(msg)

            email_id = str(uuid.uuid4())

            # Thread matching via In-Reply-To
            thread_id = email_id
            if in_reply_to:
                orig = await db.execute(text("""
                    SELECT thread_id FROM emails
                    WHERE message_id_header = :mid AND is_deleted = FALSE LIMIT 1
                """), {"mid": in_reply_to})
                orig_row = orig.fetchone()
                if orig_row and orig_row.thread_id:
                    thread_id = str(orig_row.thread_id)

            # Auto-link to lead by from_email
            lead_id = None
            lead_row = await db.execute(text(
                "SELECT id FROM leads WHERE email = :email LIMIT 1"
            ), {"email": from_email})
            lead = lead_row.fetchone()
            if lead:
                lead_id = str(lead.id)

            # Parse date from email headers
            date_str = msg.get("Date")
            received_at = now
            if date_str:
                try:
                    parsed = email_lib.utils.parsedate_to_datetime(date_str)
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=timezone.utc)
                    received_at = parsed
                except Exception:
                    pass

            # Insert — ON CONFLICT on message_id_header unique index
            result = await db.execute(text("""
                INSERT INTO emails (
                    id, direction, from_email, from_name, to_email, to_name,
                    subject, body_text, body_html,
                    status, message_id_header, in_reply_to, references_header, thread_id,
                    lead_id, webhook_provider, received_at, created_at
                ) VALUES (
                    CAST(:id AS uuid), 'inbound', :from_email, :from_name, :to_email, NULL,
                    :subject, :body_text, :body_html,
                    'received', :message_id_header, :in_reply_to, :references_header, CAST(:thread_id AS uuid),
                    :lead_id, 'imap', :received_at, :created_at
                )
                ON CONFLICT (message_id_header) WHERE message_id_header IS NOT NULL AND message_id_header != ''
                DO NOTHING
                RETURNING id
            """), {
                "id": email_id,
                "from_email": from_email,
                "from_name": from_name,
                "to_email": to_email,
                "subject": subject,
                "body_text": body_text,
                "body_html": body_html,
                "message_id_header": msg_id_header,
                "in_reply_to": in_reply_to,
                "references_header": references,
                "thread_id": thread_id,
                "lead_id": lead_id,
                "received_at": received_at,
                "created_at": now,
            })
            row = result.fetchone()
            if row:
                synced += 1
        except Exception as e:
            errors.append(str(e))
            if len(errors) > 10:
                errors.append("... (truncated)")
                break

    await db.commit()

    # Update imap_last_sync_at in platform.tenants
    await db.execute(text(
        "UPDATE platform.tenants SET imap_last_sync_at = :now WHERE slug = :slug"
    ), {"now": now, "slug": tenant_slug})
    await db.commit()

    # Reset search_path
    await db.execute(text("SET search_path TO public"))

    logger.info("IMAP sync for %s: synced=%d errors=%d", tenant_slug, synced, len(errors))
    return {"synced": synced, "errors": errors}
