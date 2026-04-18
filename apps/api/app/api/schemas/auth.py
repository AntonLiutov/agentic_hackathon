from __future__ import annotations

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


class AuthSessionResponse(BaseModel):
    user: AuthUserResponse


class LogoutResponse(BaseModel):
    success: bool = True
