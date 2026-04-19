from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.api.schemas.presence import PresenceStatus
from app.db.models.enums import FriendRequestStatus

FriendshipState = Literal["self", "friend", "incoming_request", "outgoing_request", "none"]


class FriendSummaryResponse(BaseModel):
    friendship_id: UUID
    user_id: UUID
    username: str
    friends_since: datetime
    presence_status: PresenceStatus = "offline"


class FriendListResponse(BaseModel):
    friends: list[FriendSummaryResponse]


class FriendRequestSummaryResponse(BaseModel):
    id: UUID
    requester_user_id: UUID
    requester_username: str
    recipient_user_id: UUID
    recipient_username: str
    request_text: str | None
    status: FriendRequestStatus
    created_at: datetime


class FriendRequestListResponse(BaseModel):
    incoming_requests: list[FriendRequestSummaryResponse]
    outgoing_requests: list[FriendRequestSummaryResponse]


class CreateFriendRequestRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "username": "alice",
                "message": "Want to connect for project collaboration?",
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
    message: (
        Annotated[
            str,
            StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
        ]
        | None
    ) = None
