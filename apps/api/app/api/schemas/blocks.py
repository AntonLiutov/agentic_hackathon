from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints


class BlockedUserSummaryResponse(BaseModel):
    block_id: UUID
    blocked_user_id: UUID
    blocked_username: str
    reason: str | None
    blocked_at: datetime


class BlockedUserListResponse(BaseModel):
    blocked_users: list[BlockedUserSummaryResponse]


class CreateUserBlockRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "username": "alice",
                "reason": "Do not contact me again.",
            }
        }
    )

    username: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=3,
            max_length=64,
            pattern=r"^[A-Za-z0-9_.-]+$",
        ),
    ]
    reason: (
        Annotated[
            str,
            StringConstraints(strip_whitespace=True, min_length=1, max_length=255),
        ]
        | None
    ) = None
