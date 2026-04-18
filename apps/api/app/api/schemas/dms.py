from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.db.models.enums import DmStatus


class DirectMessageSummaryResponse(BaseModel):
    id: UUID
    counterpart_user_id: UUID
    counterpart_username: str
    counterpart_email: str
    status: DmStatus
    created_at: datetime
    is_initiator: bool
    can_message: bool


class DirectMessageListResponse(BaseModel):
    direct_messages: list[DirectMessageSummaryResponse]


class CreateDirectMessageRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "username": "alice",
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
