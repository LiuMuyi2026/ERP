import asyncio
import logging
import smtplib
import ssl
import uuid
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class SmtpConfig:
    email_enabled: bool
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_from_email: str
    smtp_from_name: str
    smtp_use_tls: bool
    smtp_use_ssl: bool
    smtp_timeout_seconds: int


@dataclass
class Attachment:
    filename: str
    content_bytes: bytes
    mime_type: str = "application/octet-stream"


def _base_smtp_config() -> SmtpConfig:
    return SmtpConfig(
        email_enabled=settings.email_enabled,
        smtp_host=settings.smtp_host or "",
        smtp_port=settings.smtp_port,
        smtp_username=settings.smtp_username or "",
        smtp_password=settings.smtp_password or "",
        smtp_from_email=settings.smtp_from_email or "",
        smtp_from_name=settings.smtp_from_name or "Nexus ERP",
        smtp_use_tls=settings.smtp_use_tls,
        smtp_use_ssl=settings.smtp_use_ssl,
        smtp_timeout_seconds=settings.smtp_timeout_seconds,
    )


def build_smtp_config(overrides: dict | None = None) -> SmtpConfig:
    config = _base_smtp_config()
    if overrides:
        for key, value in overrides.items():
            if value is None:
                continue
            if hasattr(config, key):
                setattr(config, key, value)
    return config


def email_delivery_enabled(config: SmtpConfig) -> bool:
    return bool(config.email_enabled and config.smtp_host and config.smtp_from_email)


def _send_email_sync(
    config: SmtpConfig,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    *,
    cc: str | None = None,
    bcc: str | None = None,
    attachments: list[Attachment] | None = None,
    message_id: str | None = None,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> str:
    """Send an email synchronously. Returns the Message-ID used."""
    msg = EmailMessage()
    from_label = config.smtp_from_name or config.smtp_from_email
    msg["Subject"] = subject
    msg["From"] = formataddr((from_label, config.smtp_from_email))
    msg["To"] = to_email

    if cc:
        msg["Cc"] = cc
    if bcc:
        msg["Bcc"] = bcc

    # Custom headers for threading
    mid = message_id or make_msgid(domain="nexus-erp")
    msg["Message-ID"] = mid
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references

    msg.set_content(text_body or "")
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    # Attachments
    if attachments:
        for att in attachments:
            maintype, _, subtype = att.mime_type.partition("/")
            if not subtype:
                maintype, subtype = "application", "octet-stream"
            msg.add_attachment(
                att.content_bytes,
                maintype=maintype,
                subtype=subtype,
                filename=att.filename,
            )

    # Build all recipients for envelope
    all_recipients = [to_email]
    if cc:
        all_recipients.extend(a.strip() for a in cc.split(",") if a.strip())
    if bcc:
        all_recipients.extend(a.strip() for a in bcc.split(",") if a.strip())

    if config.smtp_use_ssl:
        server = smtplib.SMTP_SSL(
            host=config.smtp_host,
            port=config.smtp_port,
            timeout=config.smtp_timeout_seconds,
            context=ssl.create_default_context(),
        )
    else:
        server = smtplib.SMTP(
            host=config.smtp_host,
            port=config.smtp_port,
            timeout=config.smtp_timeout_seconds,
        )

    try:
        server.ehlo()
        if config.smtp_use_tls and not config.smtp_use_ssl:
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
        if config.smtp_username:
            server.login(config.smtp_username, config.smtp_password or "")
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            pass

    return mid


async def send_email(
    config: SmtpConfig,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    *,
    cc: str | None = None,
    bcc: str | None = None,
    attachments: list[Attachment] | None = None,
    message_id: str | None = None,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> tuple[bool, str, str]:
    """Send email async. Returns (success, status_message, message_id)."""
    if not email_delivery_enabled(config):
        return False, "email_delivery_disabled_or_unconfigured", ""
    try:
        mid = await asyncio.to_thread(
            _send_email_sync, config, to_email, subject, text_body, html_body,
            cc=cc, bcc=bcc, attachments=attachments,
            message_id=message_id, in_reply_to=in_reply_to, references=references,
        )
        return True, "sent", mid
    except Exception as exc:
        logger.warning("Email send failed to %s: %s", to_email, exc)
        return False, str(exc), ""
