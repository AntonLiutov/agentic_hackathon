from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

PresenceStatus = Literal["online", "afk", "offline"]


class PresenceHeartbeatRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "tab_id": "9f90e6b2-9484-4f4c-a0fb-2fdc0c47f024",
                "last_interaction_at": "2026-04-19T10:02:00Z",
            }
        }
    )

    tab_id: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=8, max_length=100),
    ]
    last_interaction_at: datetime


class PresenceHeartbeatResponse(BaseModel):
    presence_status: PresenceStatus
    checked_at: datetime
