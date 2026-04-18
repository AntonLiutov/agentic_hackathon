from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.db.models.enums import InvitationStatus, RoomVisibility

RoomName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=3, max_length=120, pattern=r"^[A-Za-z0-9_.-]+$"
    ),
]
RoomDescription = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
]
InvitationMessage = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]


class RoomSummaryResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    visibility: RoomVisibility
    owner_user_id: UUID
    member_count: int
    is_member: bool
    is_owner: bool
    is_banned: bool = False
    can_join: bool
    can_leave: bool
    joined_at: datetime | None = None


class RoomListResponse(BaseModel):
    rooms: list[RoomSummaryResponse]


class CreateRoomRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "engineering-room",
                "description": "Room for product and engineering coordination.",
                "visibility": "public",
            }
        }
    )

    name: RoomName
    description: RoomDescription | None = None
    visibility: RoomVisibility


class RoomInvitationResponse(BaseModel):
    id: UUID
    room_conversation_id: UUID
    room_name: str
    room_description: str | None
    inviter_username: str | None
    status: InvitationStatus
    created_at: datetime


class RoomInvitationListResponse(BaseModel):
    invitations: list[RoomInvitationResponse]


class CreateRoomInvitationRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "username": "alice",
                "message": "Join the private planning room for the launch workstream.",
            }
        }
    )

    username: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$"
        ),
    ]
    message: InvitationMessage | None = None
