from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.api.schemas.presence import PresenceStatus
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
    is_admin: bool = False
    is_banned: bool = False
    can_join: bool
    can_leave: bool
    can_manage_members: bool = False
    joined_at: datetime | None = None
    unread_count: int = 0


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


class RoomMemberResponse(BaseModel):
    id: UUID
    username: str
    joined_at: datetime
    is_owner: bool
    is_admin: bool
    can_remove: bool
    presence_status: PresenceStatus = "offline"


class RoomMemberListResponse(BaseModel):
    members: list[RoomMemberResponse]


class RoomBanResponse(BaseModel):
    id: UUID
    user_id: UUID
    username: str
    banned_at: datetime
    banned_by_username: str | None
    reason: str | None


class RoomBanListResponse(BaseModel):
    bans: list[RoomBanResponse]


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
