import asyncio
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

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


def _send_email_sync(config: SmtpConfig, to_email: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    msg = EmailMessage()
    from_label = config.smtp_from_name or config.smtp_from_email
    msg["Subject"] = subject
    msg["From"] = f"{from_label} <{config.smtp_from_email}>"
    msg["To"] = to_email
    msg.set_content(text_body or "")
    if html_body:
        msg.add_alternative(html_body, subtype="html")

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


async def send_email(config: SmtpConfig, to_email: str, subject: str, text_body: str, html_body: str | None = None) -> tuple[bool, str]:
    if not email_delivery_enabled(config):
        return False, "email_delivery_disabled_or_unconfigured"
    try:
        await asyncio.to_thread(_send_email_sync, config, to_email, subject, text_body, html_body)
        return True, "sent"
    except Exception as exc:
        logger.warning("Email send failed to %s: %s", to_email, exc)
        return False, str(exc)
