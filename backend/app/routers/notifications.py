from fastapi import APIRouter, Depends, HTTPException
from app.config import settings
from app.services.mailer import build_smtp_config, email_delivery_enabled, send_email
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List
from app.deps import get_current_user_with_tenant
import uuid

router = APIRouter(prefix="/notifications", tags=["notifications"])

NOTIF_TYPES = {
    "system": "系统通知",
    "hr": "人事通知",
    "crm": "客户通知",
    "task": "任务通知",
    "finance": "财务通知",
    "alert": "预警通知",
}


class SendNotification(BaseModel):
    title: str
    body: Optional[str] = None
    type: str = "system"
    link: Optional[str] = None
    # targets: list of user_ids, or empty/None = broadcast to all
    user_ids: Optional[List[str]] = None


class NotificationPrefsPatch(BaseModel):
    email_mentions: Optional[bool] = None
    email_updates: Optional[bool] = None
    email_weekly: Optional[bool] = None
    push_mentions: Optional[bool] = None
    push_comments: Optional[bool] = None
    browser_alerts: Optional[bool] = None


class NotificationUserSmtp(BaseModel):
    email_enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    smtp_use_ssl: Optional[bool] = None
    smtp_timeout_seconds: Optional[int] = None


USER_SMTP_FIELDS = {
    "email_enabled", "smtp_host", "smtp_port", "smtp_username", "smtp_password",
    "smtp_from_email", "smtp_from_name", "smtp_use_tls", "smtp_use_ssl", "smtp_timeout_seconds",
}


def _normalize_user_smtp(row: dict | None) -> dict:
    base = {
        "email_enabled": False,
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_username": "",
        "smtp_from_email": "",
        "smtp_from_name": "Nexus ERP",
        "smtp_use_tls": True,
        "smtp_use_ssl": False,
        "smtp_timeout_seconds": 20,
        "has_password": False,
    }
    if not row:
        return base
    normalized = {**base}
    normalized.update({k: row.get(k, normalized[k]) for k in base if k in row})
    normalized["has_password"] = bool(row.get("smtp_password"))
    normalized["smtp_port"] = row.get("smtp_port") or normalized["smtp_port"]
    normalized["smtp_use_tls"] = bool(row.get("smtp_use_tls"))
    normalized["smtp_use_ssl"] = bool(row.get("smtp_use_ssl"))
    normalized["email_enabled"] = bool(row.get("email_enabled"))
    return normalized


def _build_user_smtp_response(row: dict | None) -> dict:
    data = _normalize_user_smtp(row)
    return {
        "email_enabled": data["email_enabled"],
        "smtp_host": data["smtp_host"],
        "smtp_port": data["smtp_port"],
        "smtp_username": data["smtp_username"],
        "smtp_from_email": data["smtp_from_email"],
        "smtp_from_name": data["smtp_from_name"],
        "smtp_use_tls": data["smtp_use_tls"],
        "smtp_use_ssl": data["smtp_use_ssl"],
        "smtp_timeout_seconds": data["smtp_timeout_seconds"],
        "has_password": data["has_password"],
    }


DEFAULT_PREFS = {
    "email_mentions": True,
    "email_updates": False,
    "email_weekly": True,
    "push_mentions": True,
    "push_comments": False,
    "browser_alerts": True,
}

PREF_KEYS = tuple(DEFAULT_PREFS.keys())


def _normalize_prefs(row: dict | None) -> dict:
    normalized = dict(DEFAULT_PREFS)
    if not row:
        return normalized
    for k in PREF_KEYS:
        if k in row and row[k] is not None:
            normalized[k] = bool(row[k])
    return normalized


def _build_pref_update_payload(body: NotificationPrefsPatch) -> dict:
    return {k: v for k, v in body.model_dump(exclude_unset=True).items() if k in PREF_KEYS}


def _build_notification_email(
    notif_type: str,
    title: str,
    body: Optional[str],
    link: Optional[str],
    sender_name: str,
) -> tuple[str, str, str]:
    type_label = NOTIF_TYPES.get(notif_type, NOTIF_TYPES["system"])
    subject = f"[{type_label}] {title}"
    sender_text = sender_name or "Nexus ERP"
    detail_text = (body or "").strip()
    link_line = f"\n\n查看详情: {link}" if link else ""
    text_body = (
        f"{type_label}\n\n"
        f"{title}\n\n"
        f"{detail_text if detail_text else '你有一条新的系统通知。'}"
        f"{link_line}\n\n"
        f"发送人: {sender_text}"
    )
    detail_html = detail_text if detail_text else "你有一条新的系统通知。"
    link_html = f'<p style="margin:12px 0 0;"><a href="{link}">查看详情</a></p>' if link else ""
    html_body = (
        "<div style='font-family:Arial,sans-serif;line-height:1.6;color:#111;'>"
        f"<p style='margin:0 0 8px;color:#666;font-size:12px;'>{type_label}</p>"
        f"<h2 style='margin:0 0 12px;font-size:18px;'>{title}</h2>"
        f"<p style='margin:0 0 8px;'>{detail_html}</p>"
        f"{link_html}"
        f"<p style='margin:18px 0 0;color:#666;font-size:12px;'>发送人: {sender_text}</p>"
        "</div>"
    )
    return subject, text_body, html_body


def _expand_link(link: Optional[str]) -> Optional[str]:
    if not link:
        return None
    link = link.strip()
    if not link:
        return None
    if link.startswith("http://") or link.startswith("https://"):
        return link
    if link.startswith("/"):
        return f"{settings.app_base_url.rstrip('/')}{link}"
    return f"{settings.app_base_url.rstrip('/')}/{link}"


async def _load_tenant_smtp_overrides(db, tenant_slug: str | None) -> dict:
    if not tenant_slug:
        return {}
    result = await db.execute(
        text("""
            SELECT email_enabled, smtp_host, smtp_port, smtp_username, smtp_password,
                   smtp_from_email, smtp_from_name, smtp_use_tls, smtp_use_ssl, smtp_timeout_seconds
            FROM platform.tenants
            WHERE slug = :slug
        """),
        {"slug": tenant_slug},
    )
    row = result.fetchone()
    return dict(row._mapping) if row else {}


# ── Get my notifications ──────────────────────────────────────────────────────

@router.get("")
async def list_notifications(
    limit: int = 50,
    unread_only: bool = False,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    user_id = ctx["sub"]
    where = "user_id = :uid"
    params: dict = {"uid": user_id, "limit": limit}
    if unread_only:
        where += " AND is_read = FALSE"
    result = await db.execute(
        text(f"SELECT * FROM notifications WHERE {where} ORDER BY created_at DESC LIMIT :limit"),
        params,
    )
    rows = [dict(r._mapping) for r in result.fetchall()]
    # unread count
    cnt = await db.execute(
        text("SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND is_read = FALSE"),
        {"uid": user_id},
    )
    unread_count = cnt.scalar() or 0
    return {"notifications": rows, "unread_count": unread_count}


@router.get("/unread-count")
async def unread_count(ctx: dict = Depends(get_current_user_with_tenant)):
    result = await ctx["db"].execute(
        text("SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND is_read = FALSE"),
        {"uid": ctx["sub"]},
    )
    return {"count": result.scalar() or 0}


@router.get("/types")
async def get_types(_: dict = Depends(get_current_user_with_tenant)):
    return NOTIF_TYPES


# ── Notification preferences ──────────────────────────────────────────────────

@router.get("/preferences")
async def get_notification_preferences(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]
    result = await db.execute(
        text(
            """SELECT email_mentions, email_updates, email_weekly,
                      push_mentions, push_comments, browser_alerts
               FROM user_notification_prefs
               WHERE user_id = :uid"""
        ),
        {"uid": user_id},
    )
    row = result.fetchone()
    prefs = _normalize_prefs(dict(row._mapping) if row else None)
    return prefs


@router.patch("/preferences")
async def update_notification_preferences(
    body: NotificationPrefsPatch,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    user_id = ctx["sub"]
    patch = _build_pref_update_payload(body)
    if not patch:
        return await get_notification_preferences(ctx)

    cur = await db.execute(
        text(
            """SELECT email_mentions, email_updates, email_weekly,
                      push_mentions, push_comments, browser_alerts
               FROM user_notification_prefs
               WHERE user_id = :uid"""
        ),
        {"uid": user_id},
    )
    current_row = cur.fetchone()
    merged = _normalize_prefs(dict(current_row._mapping) if current_row else None)
    merged.update(patch)

    await db.execute(
        text(
            """INSERT INTO user_notification_prefs
               (user_id, email_mentions, email_updates, email_weekly, push_mentions, push_comments, browser_alerts, updated_at)
               VALUES (:uid, :email_mentions, :email_updates, :email_weekly, :push_mentions, :push_comments, :browser_alerts, NOW())
               ON CONFLICT (user_id) DO UPDATE SET
                 email_mentions = EXCLUDED.email_mentions,
                 email_updates = EXCLUDED.email_updates,
                 email_weekly = EXCLUDED.email_weekly,
                 push_mentions = EXCLUDED.push_mentions,
                 push_comments = EXCLUDED.push_comments,
                 browser_alerts = EXCLUDED.browser_alerts,
                 updated_at = NOW()"""
        ),
        {"uid": user_id, **merged},
    )
    await db.commit()
    return merged


@router.get("/user-smtp")
async def get_user_smtp(ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]
    result = await db.execute(
        text("""
            SELECT *
            FROM user_email_smtp
            WHERE user_id = :uid
        """),
        {"uid": user_id},
    )
    row = result.fetchone()
    return _build_user_smtp_response(dict(row._mapping) if row else None)


@router.patch("/user-smtp")
async def update_user_smtp(
    body: NotificationUserSmtp,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    db = ctx["db"]
    user_id = ctx["sub"]
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if k in USER_SMTP_FIELDS}
    if not updates:
        return await get_user_smtp(ctx)

    cur = await db.execute(
        text("SELECT * FROM user_email_smtp WHERE user_id = :uid"),
        {"uid": user_id},
    )
    existing_row = cur.fetchone()
    existing = dict(existing_row._mapping) if existing_row else {}
    merged = _normalize_user_smtp(existing)
    merged.update({k: v for k, v in updates.items() if v is not None})
    if 'smtp_password' in updates:
        merged['smtp_password'] = updates['smtp_password']
    else:
        merged['smtp_password'] = existing.get('smtp_password')

    params = {
        "user_id": user_id,
        "email_enabled": merged["email_enabled"],
        "smtp_host": merged["smtp_host"],
        "smtp_port": merged["smtp_port"],
        "smtp_username": merged["smtp_username"],
        "smtp_password": merged.get("smtp_password"),
        "smtp_from_email": merged["smtp_from_email"],
        "smtp_from_name": merged["smtp_from_name"],
        "smtp_use_tls": merged["smtp_use_tls"],
        "smtp_use_ssl": merged["smtp_use_ssl"],
        "smtp_timeout_seconds": merged["smtp_timeout_seconds"],
    }
    await db.execute(
        text("""
            INSERT INTO user_email_smtp
            (user_id, email_enabled, smtp_host, smtp_port, smtp_username, smtp_password,
             smtp_from_email, smtp_from_name, smtp_use_tls, smtp_use_ssl, smtp_timeout_seconds, updated_at)
            VALUES (:user_id, :email_enabled, :smtp_host, :smtp_port, :smtp_username, :smtp_password,
                    :smtp_from_email, :smtp_from_name, :smtp_use_tls, :smtp_use_ssl, :smtp_timeout_seconds, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
              email_enabled = EXCLUDED.email_enabled,
              smtp_host = EXCLUDED.smtp_host,
              smtp_port = EXCLUDED.smtp_port,
              smtp_username = EXCLUDED.smtp_username,
              smtp_password = COALESCE(EXCLUDED.smtp_password, user_email_smtp.smtp_password),
              smtp_from_email = EXCLUDED.smtp_from_email,
              smtp_from_name = EXCLUDED.smtp_from_name,
              smtp_use_tls = EXCLUDED.smtp_use_tls,
              smtp_use_ssl = EXCLUDED.smtp_use_ssl,
              smtp_timeout_seconds = EXCLUDED.smtp_timeout_seconds,
              updated_at = NOW()
        """),
        params,
    )
    await db.commit()
    return _build_user_smtp_response(merged)


# ── Get single notification ──────────────────────────────────────────────────

@router.get("/{notif_id}")
async def get_notification(notif_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    db = ctx["db"]
    user_id = ctx["sub"]
    result = await db.execute(
        text("SELECT * FROM notifications WHERE id = :id AND user_id = :uid"),
        {"id": notif_id, "uid": user_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    return dict(row._mapping)


# ── Mark read ─────────────────────────────────────────────────────────────────

@router.patch("/{notif_id}/read")
async def mark_read(notif_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(
        text("UPDATE notifications SET is_read = TRUE WHERE id = :id AND user_id = :uid"),
        {"id": notif_id, "uid": ctx["sub"]},
    )
    await ctx["db"].commit()
    return {"status": "ok"}


@router.patch("/read-all")
async def mark_all_read(ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(
        text("UPDATE notifications SET is_read = TRUE WHERE user_id = :uid AND is_read = FALSE"),
        {"uid": ctx["sub"]},
    )
    await ctx["db"].commit()
    return {"status": "ok"}


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{notif_id}")
async def delete_notification(notif_id: str, ctx: dict = Depends(get_current_user_with_tenant)):
    await ctx["db"].execute(
        text("DELETE FROM notifications WHERE id = :id AND user_id = :uid"),
        {"id": notif_id, "uid": ctx["sub"]},
    )
    await ctx["db"].commit()
    return {"status": "deleted"}


# ── Admin: send ───────────────────────────────────────────────────────────────

@router.post("/send")
async def send_notification(
    body: SendNotification,
    ctx: dict = Depends(get_current_user_with_tenant),
):
    """Send notification to specific users or broadcast to all (admin only)."""
    db = ctx["db"]
    sender_id = ctx["sub"]

    notif_type = body.type if body.type in NOTIF_TYPES else "system"

    # Resolve targets
    if body.user_ids:
        target_ids = list(dict.fromkeys(body.user_ids))
        result = await db.execute(
            text(
                """SELECT id, email, full_name
                   FROM users
                   WHERE is_active = TRUE AND id = ANY(CAST(:uids AS UUID[]))"""
            ),
            {"uids": target_ids},
        )
        target_users = [dict(r._mapping) for r in result.fetchall()]
    else:
        # Broadcast: all active users
        result = await db.execute(text("SELECT id, email, full_name FROM users WHERE is_active = TRUE"))
        target_users = [dict(r._mapping) for r in result.fetchall()]

    if not target_users:
        return {"sent": 0, "email_sent": 0, "email_failed": 0, "email_skipped": 0}

    target_ids = [str(u["id"]) for u in target_users]
    notif_ids_by_user: dict[str, str] = {}
    sent = 0
    for uid in target_ids:
        notif_id = str(uuid.uuid4())
        await db.execute(
            text("""INSERT INTO notifications (id, user_id, title, body, type, link, sender_id)
                     VALUES (:id, :uid, :title, :body, :type, :link, :sender)"""),
            {
                "id": notif_id,
                "uid": uid,
                "title": body.title,
                "body": body.body,
                "type": notif_type,
                "link": body.link,
                "sender": sender_id,
            },
        )
        notif_ids_by_user[uid] = notif_id
        sent += 1
    await db.commit()

    # Notification email delivery (respecting user preferences)
    pref_rows = await db.execute(
        text(
            """SELECT user_id, email_updates
               FROM user_notification_prefs
               WHERE user_id = ANY(CAST(:uids AS UUID[]))"""
        ),
        {"uids": target_ids},
    )
    pref_map = {str(r.user_id): bool(r.email_updates) for r in pref_rows.fetchall()}

    sender_name = ""
    sender_row = await db.execute(
        text("SELECT full_name, email FROM users WHERE id = :uid LIMIT 1"),
        {"uid": sender_id},
    )
    s = sender_row.fetchone()
    if s:
        sender_name = (s.full_name or s.email or "").strip()

    full_link = _expand_link(body.link)
    subject, text_body, html_body = _build_notification_email(
        notif_type=notif_type,
        title=body.title,
        body=body.body,
        link=full_link,
        sender_name=sender_name,
    )

    email_sent = 0
    email_failed = 0
    email_skipped = 0
    email_logs: list[dict] = []

    smtp_config = build_smtp_config(await _load_tenant_smtp_overrides(db, ctx.get("tenant_slug")))
    smtp_enabled = email_delivery_enabled(smtp_config)
    for user in target_users:
        uid = str(user["id"])
        to_email = (user.get("email") or "").strip()
        wants_email = pref_map.get(uid, DEFAULT_PREFS["email_updates"])
        if not to_email or not wants_email or not smtp_enabled:
            email_skipped += 1
            continue

        ok, msg = await send_email(smtp_config, to_email, subject, text_body, html_body)
        if ok:
            email_sent += 1
        else:
            email_failed += 1
        email_logs.append(
            {
                "id": str(uuid.uuid4()),
                "notification_id": notif_ids_by_user.get(uid),
                "user_id": uid,
                "email": to_email,
                "subject": subject[:255],
                "status": "sent" if ok else "failed",
                "error": None if ok else msg[:2000],
            }
        )

    if email_logs:
        for log in email_logs:
            await db.execute(
                text(
                    """INSERT INTO notification_email_logs
                       (id, notification_id, user_id, email, subject, status, error)
                       VALUES (:id, :notification_id, :user_id, :email, :subject, :status, :error)"""
                ),
                log,
            )
        await db.commit()

    return {"sent": sent, "email_sent": email_sent, "email_failed": email_failed, "email_skipped": email_skipped}
