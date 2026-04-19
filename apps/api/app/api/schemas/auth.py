from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$"
    ),
]
EmailAddress = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=5, max_length=320)
]
PasswordValue = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class AuthUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    email: str


class RegisterRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "sarah@example.com",
                "username": "sarah.connor",
                "password": "correct-horse-battery-staple",
            }
        }
    )

    email: EmailAddress
    username: Username
    password: PasswordValue


class LoginRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "sarah@example.com",
                "password": "correct-horse-battery-staple",
            }
        }
    )

    email: EmailAddress
    password: PasswordValue


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "current_password": "correct-horse-battery-staple",
                "new_password": "new-horse-battery-staple",
            }
        }
    )

    current_password: PasswordValue
    new_password: PasswordValue


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "current_password": "correct-horse-battery-staple",
            }
        }
    )

    current_password: PasswordValue


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "sarah@example.com",
            }
        }
    )

    email: EmailAddress


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "token": "paste-your-reset-token-here",
                "new_password": "new-horse-battery-staple",
            }
        }
    )

    token: str
    new_password: PasswordValue


class AuthSessionResponse(BaseModel):
    user: AuthUserResponse


class UserSessionResponse(BaseModel):
    id: UUID
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    last_seen_at: datetime | None
    expires_at: datetime
    is_current: bool


class UserSessionsResponse(BaseModel):
    sessions: list[UserSessionResponse]


class ActionResponse(BaseModel):
    success: bool = True
    message: str


class PasswordResetTokenStatusResponse(BaseModel):
    valid: bool = True


class LogoutResponse(BaseModel):
    success: bool = True
