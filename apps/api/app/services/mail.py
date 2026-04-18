from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

from app.core.config import Settings


def _send_email_message(settings: Settings, message: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as client:
        client.ehlo()

        if settings.smtp_username and settings.smtp_password:
            client.login(settings.smtp_username, settings.smtp_password)

        client.send_message(message)


async def send_password_reset_email(
    *,
    settings: Settings,
    recipient_email: str,
    username: str,
    reset_url: str,
    expires_in_seconds: int,
) -> None:
    expires_in_minutes = max(1, expires_in_seconds // 60)
    subject = "Reset your Agentic Chat password"
    body = (
        f"Hello {username},\n\n"
        "We received a request to reset your Agentic Chat password.\n\n"
        f"Open this link to choose a new password:\n{reset_url}\n\n"
        f"This link expires in {expires_in_minutes} minutes.\n"
        "If you did not request a password reset, you can ignore this email.\n"
    )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = recipient_email
    message.set_content(body)

    await asyncio.to_thread(_send_email_message, settings, message)
