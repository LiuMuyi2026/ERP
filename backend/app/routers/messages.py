from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from pydantic import BaseModel
from app.deps import get_current_user_with_tenant
from datetime import datetime, timezone
import uuid
import csv
import io

router = APIRouter(prefix="/messages", tags=["messages"])


class SendMessage(BaseModel):
    content: str


# ── Conversations list ────────────────────────────────────────────────────────

@router.get("/conversations")
async def list_conversations(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    uid = ctx["sub"]
    result = await db.execute(text("""
        WITH partners AS (
            SELECT DISTINCT
                CASE WHEN from_user_id = CAST(:uid AS uuid) THEN to_user_id ELSE from_user_id END AS other_id
            FROM messages
            WHERE from_user_id = CAST(:uid AS uuid) OR to_user_id = CAST(:uid AS uuid)
        ),
        latest AS (
            SELECT DISTINCT ON (
                CASE WHEN from_user_id = CAST(:uid AS uuid) THEN to_user_id ELSE from_user_id END
            )
                CASE WHEN from_user_id = CAST(:uid AS uuid) THEN to_user_id ELSE from_user_id END AS other_id,
                content AS last_content,
                created_at AS last_at
            FROM messages
            WHERE from_user_id = CAST(:uid AS uuid) OR to_user_id = CAST(:uid AS uuid)
            ORDER BY
                CASE WHEN from_user_id = CAST(:uid AS uuid) THEN to_user_id ELSE from_user_id END,
                created_at DESC
        ),
        unread AS (
            SELECT from_user_id AS other_id, COUNT(*) AS cnt
            FROM messages
            WHERE to_user_id = CAST(:uid AS uuid) AND is_read = FALSE
            GROUP BY from_user_id
        )
        SELECT
            p.other_id::text,
            u.full_name,
            u.email,
            u.avatar_url,
            l.last_content,
            l.last_at,
            COALESCE(ur.cnt, 0) AS unread_count
        FROM partners p
        JOIN users u ON u.id = p.other_id
        JOIN latest l ON l.other_id = p.other_id
        LEFT JOIN unread ur ON ur.other_id = p.other_id
        ORDER BY l.last_at DESC
    """), {"uid": uid})
    return [dict(r._mapping) for r in result.fetchall()]


# ── Unread count ──────────────────────────────────────────────────────────────

@router.get("/unread-count")
async def unread_count(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("SELECT COUNT(*) FROM messages WHERE to_user_id = CAST(:uid AS uuid) AND is_read = FALSE"),
        {"uid": ctx["sub"]},
    )
    return {"count": result.scalar() or 0}


# ── Admin helpers ─────────────────────────────────────────────────────────────

async def _require_admin(ctx: dict):
    """Raise 403 if current user is not tenant_admin or platform_admin."""
    result = await ctx["db"].execute(
        text("SELECT role FROM users WHERE id = CAST(:uid AS uuid)"),
        {"uid": ctx["sub"]},
    )
    row = result.fetchone()
    if not row or row.role not in ("tenant_admin", "platform_admin"):
        raise HTTPException(status_code=403, detail="管理员权限不足")


# ── Admin: All conversation pairs ─────────────────────────────────────────────

@router.get("/admin/conversations")
async def admin_list_conversations(ctx: dict = Depends(get_current_user_with_tenant)):
    await _require_admin(ctx)
    db = ctx["db"]
    result = await db.execute(text("""
        WITH pairs AS (
            SELECT
                LEAST(from_user_id::text, to_user_id::text)    AS uid_a,
                GREATEST(from_user_id::text, to_user_id::text) AS uid_b,
                COUNT(*) AS total_messages,
                MAX(created_at) AS last_at,
                (array_agg(content ORDER BY created_at DESC))[1] AS last_content
            FROM messages
            GROUP BY uid_a, uid_b
        )
        SELECT
            p.uid_a, p.uid_b,
            ua.full_name AS name_a, ua.email AS email_a,
            ub.full_name AS name_b, ub.email AS email_b,
            p.total_messages,
            p.last_at,
            p.last_content
        FROM pairs p
        JOIN users ua ON ua.id = CAST(p.uid_a AS uuid)
        JOIN users ub ON ub.id = CAST(p.uid_b AS uuid)
        ORDER BY p.last_at DESC
    """))
    return [dict(r._mapping) for r in result.fetchall()]


# ── Admin: Thread between two users ───────────────────────────────────────────

@router.get("/admin/thread/{user1_id}/{user2_id}")
async def admin_get_thread(
    user1_id: str,
    user2_id: str,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    await _require_admin(ctx)
    db = ctx["db"]
    result = await db.execute(text("""
        SELECT
            m.id::text, m.from_user_id::text, m.to_user_id::text,
            m.content, m.is_read, m.created_at,
            u.full_name AS from_name, u.email AS from_email
        FROM messages m
        JOIN users u ON u.id = m.from_user_id
        WHERE (m.from_user_id = CAST(:u1 AS uuid) AND m.to_user_id = CAST(:u2 AS uuid))
           OR (m.from_user_id = CAST(:u2 AS uuid) AND m.to_user_id = CAST(:u1 AS uuid))
        ORDER BY m.created_at ASC
    """), {"u1": user1_id, "u2": user2_id})
    return [dict(r._mapping) for r in result.fetchall()]


# ── Admin: Export all messages as CSV ─────────────────────────────────────────

@router.get("/admin/export")
async def admin_export_messages(ctx: dict = Depends(get_current_user_with_tenant)):
    await _require_admin(ctx)
    db = ctx["db"]
    result = await db.execute(text("""
        SELECT
            m.id::text,
            m.created_at,
            uf.full_name AS from_name, uf.email AS from_email,
            ut.full_name AS to_name,   ut.email AS to_email,
            m.content, m.is_read
        FROM messages m
        JOIN users uf ON uf.id = m.from_user_id
        JOIN users ut ON ut.id = m.to_user_id
        ORDER BY m.created_at ASC
    """))
    rows = result.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["消息ID", "时间", "发送方姓名", "发送方邮箱", "接收方姓名", "接收方邮箱", "内容", "已读"])
    for r in rows:
        writer.writerow([
            r.id, r.created_at.isoformat() if r.created_at else "",
            r.from_name or "", r.from_email or "",
            r.to_name or "", r.to_email or "",
            r.content or "", "是" if r.is_read else "否",
        ])

    filename = f"conversations_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Thread ────────────────────────────────────────────────────────────────────

@router.get("/{other_user_id}")
async def get_thread(
    other_user_id: str,
    limit: int = 60,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    uid = ctx["sub"]
    result = await db.execute(text("""
        SELECT
            m.id::text, m.from_user_id::text, m.to_user_id::text,
            m.content, m.is_read, m.created_at,
            u.full_name AS from_name, u.email AS from_email
        FROM messages m
        JOIN users u ON u.id = m.from_user_id
        WHERE (m.from_user_id = CAST(:uid AS uuid) AND m.to_user_id = CAST(:other AS uuid))
           OR (m.from_user_id = CAST(:other AS uuid) AND m.to_user_id = CAST(:uid AS uuid))
        ORDER BY m.created_at ASC
        LIMIT :limit
    """), {"uid": uid, "other": other_user_id, "limit": limit})
    rows = [dict(r._mapping) for r in result.fetchall()]

    # Mark messages from other user as read
    await db.execute(text("""
        UPDATE messages SET is_read = TRUE
        WHERE from_user_id = CAST(:other AS uuid) AND to_user_id = CAST(:uid AS uuid) AND is_read = FALSE
    """), {"uid": uid, "other": other_user_id})
    await db.commit()
    return rows


# ── Send ─────────────────────────────────────────────────────────────────────

@router.post("/{other_user_id}")
async def send_message(
    other_user_id: str,
    body: SendMessage,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    uid = ctx["sub"]
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.execute(text("""
        INSERT INTO messages (id, from_user_id, to_user_id, content, created_at)
        VALUES (:id, CAST(:from_id AS uuid), CAST(:to_id AS uuid), :content, :now)
    """), {"id": msg_id, "from_id": uid, "to_id": other_user_id, "content": body.content, "now": now})
    await db.commit()

    result = await db.execute(text("""
        SELECT m.id::text, m.from_user_id::text, m.to_user_id::text,
               m.content, m.is_read, m.created_at,
               u.full_name AS from_name, u.email AS from_email
        FROM messages m
        JOIN users u ON u.id = m.from_user_id
        WHERE m.id = :id
    """), {"id": msg_id})
    row = result.fetchone()
    return dict(row._mapping)
