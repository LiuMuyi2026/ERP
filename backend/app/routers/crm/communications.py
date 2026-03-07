"""
CRM Communications — unified communications list, link, and send email.
"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from app.deps import get_current_user_with_tenant

from app.routers.crm_shared import (
    SendEmailBody, LinkCommBody,
    _is_admin_scope,
)

router = APIRouter(prefix="/crm", tags=["crm"])


# ---------------------------------------------------------------------------
# Communications
# ---------------------------------------------------------------------------

@router.get("/communications")
async def list_communications(
    lead_id: Optional[str] = None,
    account_id: Optional[str] = None,
    channel: Optional[str] = None,
    direction: Optional[str] = None,
    source: Optional[str] = None,
    message_type: Optional[str] = None,
    status: Optional[str] = None,
    user_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "time_desc",
    page: int = 1,
    page_size: int = 50,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    current_user_id = ctx["sub"]
    is_admin_scope_flag = await _is_admin_scope(ctx)
    if not is_admin_scope_flag:
        user_id = current_user_id
    offset = (page - 1) * page_size

    where_outer: list[str] = []
    params: dict = {"lim": page_size, "off": offset}

    if lead_id:
        where_outer.append("lead_id = :lead_id")
        params["lead_id"] = lead_id
    if account_id:
        where_outer.append("account_id = :account_id")
        params["account_id"] = account_id
    if channel:
        where_outer.append("channel = :channel")
        params["channel"] = channel
    if direction:
        where_outer.append("direction = :direction")
        params["direction"] = direction
    if source:
        where_outer.append("source = :source")
        params["source"] = source
    if message_type:
        where_outer.append("message_type = :message_type")
        params["message_type"] = message_type
    if status:
        where_outer.append("status = :status")
        params["status"] = status
    if search:
        where_outer.append("(content ILIKE :search OR lead_name ILIKE :search OR lead_company ILIKE :search)")
        params["search"] = f"%{search}%"
    if date_from:
        where_outer.append("timestamp >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where_outer.append("timestamp <= :date_to")
        params["date_to"] = date_to
    if user_id:
        where_outer.append("owner_user_id = :owner_user_id")
        params["owner_user_id"] = user_id

    where_sql = (" AND ".join(where_outer)) if where_outer else "TRUE"
    sort_map = {
        "time_desc": "timestamp DESC",
        "time_asc": "timestamp ASC",
        "lead_name_asc": "lead_name ASC NULLS LAST, timestamp DESC",
        "lead_name_desc": "lead_name DESC NULLS LAST, timestamp DESC",
        "channel_asc": "channel ASC, timestamp DESC",
        "channel_desc": "channel DESC, timestamp DESC",
    }
    order = sort_map.get(sort_by, "timestamp DESC")

    union_sql = f"""
        WITH unified AS (
            SELECT
                i.id::text           AS id,
                'interaction'        AS source,
                i.type               AS channel,
                i.direction,
                COALESCE(i.content,'') AS content,
                i.created_at         AS timestamp,
                i.created_by::text   AS owner_user_id,
                u.full_name          AS created_by_name,
                i.lead_id::text,
                COALESCE(i.metadata->>'account_id', '') AS account_id,
                ca.name              AS account_name,
                l.full_name          AS lead_name,
                l.company            AS lead_company,
                NULL                 AS message_type,
                NULL                 AS media_url,
                NULL                 AS status,
                NULL                 AS wa_contact_id,
                CONCAT('interaction:', COALESCE(i.contact_id::text, i.id::text)) AS thread_key,
                COALESCE(l.full_name, ca.name, COALESCE(u.full_name, u.email), i.id::text) AS thread_label
            FROM interactions i
            LEFT JOIN users u ON u.id = i.created_by
            LEFT JOIN leads l ON l.id = i.lead_id
            LEFT JOIN crm_accounts ca ON ca.id = CASE
                WHEN COALESCE(i.metadata->>'account_id', '') ~* '^[0-9a-f-]{{36}}$'
                THEN CAST(i.metadata->>'account_id' AS uuid)
                ELSE NULL
            END

            UNION ALL

            SELECT
                m.id::text           AS id,
                'whatsapp_message'   AS source,
                'whatsapp'           AS channel,
                m.direction,
                COALESCE(m.content,'') AS content,
                m.timestamp,
                a.owner_user_id::text AS owner_user_id,
                NULL                 AS created_by_name,
                c.lead_id::text,
                c.account_id::text   AS account_id,
                ca.name              AS account_name,
                l.full_name          AS lead_name,
                l.company            AS lead_company,
                m.message_type,
                m.media_url,
                m.status,
                m.wa_contact_id::text,
                CONCAT('wa:', m.wa_contact_id::text) AS thread_key,
                COALESCE(l.full_name, ca.name, c.display_name, c.phone_number, m.wa_contact_id::text) AS thread_label
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
            LEFT JOIN leads l ON l.id = c.lead_id
            LEFT JOIN crm_accounts ca ON ca.id = c.account_id
            WHERE m.is_deleted = FALSE

            UNION ALL

            SELECT
                e.id::text           AS id,
                'email'              AS source,
                'email'              AS channel,
                e.direction,
                COALESCE(e.subject || ': ' || SUBSTRING(e.body_text, 1, 200), '') AS content,
                COALESCE(e.sent_at, e.received_at, e.created_at) AS timestamp,
                COALESCE(e.sender_user_id::text, ues.user_id::text, '') AS owner_user_id,
                eu.full_name         AS created_by_name,
                e.lead_id::text,
                e.account_id::text   AS account_id,
                eca.name             AS account_name,
                el.full_name         AS lead_name,
                el.company           AS lead_company,
                NULL                 AS message_type,
                NULL                 AS media_url,
                e.status,
                NULL                 AS wa_contact_id,
                COALESCE(
                    e.thread_id::text,
                    CONCAT('email:', LEAST(LOWER(COALESCE(e.from_email,'')), LOWER(COALESCE(e.to_email,''))), '|', GREATEST(LOWER(COALESCE(e.from_email,'')), LOWER(COALESCE(e.to_email,''))))
                ) AS thread_key,
                COALESCE(el.full_name, eca.name, NULLIF(e.from_name, ''), e.from_email, e.to_email) AS thread_label
            FROM emails e
            LEFT JOIN users eu ON eu.id = e.sender_user_id
            LEFT JOIN leads el ON el.id = e.lead_id
            LEFT JOIN crm_accounts eca ON eca.id = e.account_id
            LEFT JOIN LATERAL (
                SELECT s.user_id
                FROM user_email_smtp s
                WHERE LOWER(COALESCE(s.smtp_from_email, '')) = LOWER(COALESCE(e.to_email, ''))
                ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
                LIMIT 1
            ) ues ON TRUE
            WHERE e.is_deleted = FALSE
        )
        SELECT * FROM unified
        WHERE {where_sql}
        ORDER BY {order}
        LIMIT :lim OFFSET :off
    """

    count_sql = f"""
        WITH unified AS (
            SELECT i.id, 'interaction' AS source, i.type AS channel, i.direction,
                   COALESCE(i.content,'') AS content, i.created_at AS timestamp,
                   i.created_by::text AS owner_user_id,
                   i.lead_id, COALESCE(i.metadata->>'account_id', '') AS account_id,
                   l.full_name AS lead_name, l.company AS lead_company,
                   NULL::text AS message_type, NULL::text AS status
            FROM interactions i
            LEFT JOIN leads l ON l.id = i.lead_id

            UNION ALL

            SELECT m.id, 'whatsapp_message' AS source, 'whatsapp' AS channel, m.direction,
                   COALESCE(m.content,'') AS content, m.timestamp,
                   a.owner_user_id::text AS owner_user_id,
                   c.lead_id, c.account_id::text AS account_id,
                   l.full_name AS lead_name, l.company AS lead_company,
                   m.message_type, m.status
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
            LEFT JOIN leads l ON l.id = c.lead_id
            WHERE m.is_deleted = FALSE

            UNION ALL

            SELECT e.id, 'email' AS source, 'email' AS channel, e.direction,
                   COALESCE(e.subject || ': ' || SUBSTRING(e.body_text, 1, 200), '') AS content,
                   COALESCE(e.sent_at, e.received_at, e.created_at) AS timestamp,
                   COALESCE(e.sender_user_id::text, ues.user_id::text, '') AS owner_user_id,
                   e.lead_id, e.account_id::text AS account_id,
                   el.full_name AS lead_name, el.company AS lead_company,
                   NULL::text AS message_type, e.status
            FROM emails e
            LEFT JOIN leads el ON el.id = e.lead_id
            LEFT JOIN LATERAL (
                SELECT s.user_id
                FROM user_email_smtp s
                WHERE LOWER(COALESCE(s.smtp_from_email, '')) = LOWER(COALESCE(e.to_email, ''))
                ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
                LIMIT 1
            ) ues ON TRUE
            WHERE e.is_deleted = FALSE
        )
        SELECT COUNT(*) FROM unified WHERE {where_sql}
    """

    rows = await db.execute(text(union_sql), params)
    items = [dict(r._mapping) for r in rows.fetchall()]

    count_params = {k: v for k, v in params.items() if k not in ("lim", "off")}
    total_row = await db.execute(text(count_sql), count_params)
    total = total_row.scalar() or 0

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.patch("/communications/{comm_id}/link")
async def link_communication(
    comm_id: str,
    body: LinkCommBody,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    is_admin_scope_flag = await _is_admin_scope(ctx)
    uid = ctx["sub"]

    if body.source == "interaction":
        params: dict = {"cid": comm_id}
        sets: list[str] = []
        if body.lead_id is not None:
            if body.lead_id:
                sets.append("lead_id = CAST(:lid AS uuid)")
                params["lid"] = body.lead_id
            else:
                sets.append("lead_id = NULL")
        if body.account_id is not None:
            if body.account_id:
                sets.append("metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{account_id}', to_jsonb(:aid::text), true)")
                params["aid"] = body.account_id
            else:
                sets.append("metadata = COALESCE(metadata, '{}'::jsonb) - 'account_id'")
        if sets:
            if not is_admin_scope_flag:
                params["uid"] = uid
                where_guard = " AND created_by = CAST(:uid AS uuid)"
            else:
                where_guard = ""
            await db.execute(
                text(f"UPDATE interactions SET {', '.join(sets)} WHERE id = CAST(:cid AS uuid){where_guard}"),
                params,
            )
    elif body.source == "whatsapp_message":
        contact_row = await db.execute(text(
            """
            SELECT m.wa_contact_id
            FROM whatsapp_messages m
            JOIN whatsapp_contacts c ON c.id = m.wa_contact_id
            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
            WHERE m.id = CAST(:mid AS uuid)
            """
        ), {"mid": comm_id})
        contact = contact_row.fetchone()
        if contact and contact.wa_contact_id:
            sets: list[str] = []
            params: dict = {"cid": str(contact.wa_contact_id)}
            if body.lead_id is not None:
                if body.lead_id:
                    sets.append("lead_id = CAST(:lid AS uuid)")
                    params["lid"] = body.lead_id
                else:
                    sets.append("lead_id = NULL")
            if body.account_id is not None:
                if body.account_id:
                    sets.append("account_id = CAST(:aid AS uuid)")
                    params["aid"] = body.account_id
                else:
                    sets.append("account_id = NULL")
            if sets:
                if not is_admin_scope_flag:
                    params["uid"] = uid
                    where_guard = """
                        AND EXISTS (
                            SELECT 1 FROM whatsapp_contacts c
                            JOIN whatsapp_accounts a ON a.id = c.wa_account_id
                            WHERE c.id = CAST(:cid AS uuid) AND a.owner_user_id = CAST(:uid AS uuid)
                        )
                    """
                else:
                    where_guard = ""
                await db.execute(
                    text(f"UPDATE whatsapp_contacts SET {', '.join(sets)} WHERE id = CAST(:cid AS uuid){where_guard}"),
                    params,
                )
    elif body.source == "email":
        sets = []
        params: dict = {"cid": comm_id}
        if body.lead_id is not None:
            if body.lead_id:
                sets.append("lead_id = CAST(:lid AS uuid)")
                params["lid"] = body.lead_id
            else:
                sets.append("lead_id = NULL")
        if body.account_id is not None:
            if body.account_id:
                sets.append("account_id = CAST(:aid AS uuid)")
                params["aid"] = body.account_id
            else:
                sets.append("account_id = NULL")
        if sets:
            if not is_admin_scope_flag:
                params["uid"] = uid
                where_guard = """
                    AND (
                        COALESCE(sender_user_id::text, '') = :uid
                        OR EXISTS (
                            SELECT 1 FROM user_email_smtp s
                            WHERE s.user_id = CAST(:uid AS uuid)
                              AND LOWER(COALESCE(s.smtp_from_email, '')) = LOWER(COALESCE(emails.to_email, ''))
                        )
                    )
                """
            else:
                where_guard = ""
            await db.execute(text(
                f"UPDATE emails SET {', '.join(sets)} WHERE id = CAST(:cid AS uuid){where_guard}"
            ), params)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown source: {body.source}")

    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Send Email
# ---------------------------------------------------------------------------

@router.post("/leads/{lead_id}/send-email")
async def send_lead_email(
    lead_id: str, body: SendEmailBody, ctx: dict = Depends(get_current_user_with_tenant)
):
    db = ctx["db"]

    lead_row = await db.execute(
        text("SELECT id, full_name, email FROM leads WHERE id = :id"),
        {"id": lead_id},
    )
    lead = lead_row.fetchone()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    from app.services.mailer import build_smtp_config, send_email as smtp_send

    config = build_smtp_config()
    ok, result, _mid = await smtp_send(config, body.to_email, body.subject, body.body, body.html_body)
    if not ok:
        raise HTTPException(status_code=502, detail=f"Email send failed: {result}")

    interaction_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO interactions (id, lead_id, type, direction, content, metadata, created_by)
            VALUES (:id, :lead_id, 'email', 'outbound', :content,
                    CAST(:metadata AS jsonb), :created_by)
        """),
        {
            "id": interaction_id,
            "lead_id": lead_id,
            "content": body.body,
            "metadata": json.dumps({
                "subject": body.subject,
                "to_email": body.to_email,
            }),
            "created_by": ctx["sub"],
        },
    )
    await db.execute(
        text("UPDATE leads SET last_contacted_at = NOW() WHERE id = :id"),
        {"id": lead_id},
    )
    await db.commit()

    return {"ok": True, "interaction_id": interaction_id}
