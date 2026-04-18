from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_db_session,
    get_presence_service,
    get_realtime_manager,
    get_settings_from_request,
)
from app.api.schemas.presence import PresenceHeartbeatRequest, PresenceHeartbeatResponse
from app.auth.service import get_auth_context
from app.core.config import Settings
from app.presence.service import PresenceService, list_presence_subscriber_ids
from app.realtime.manager import RealtimeConnectionManager

router = APIRouter(tags=["presence"])


@router.post(
    "/api/presence/heartbeat",
    response_model=PresenceHeartbeatResponse,
    summary="Heartbeat the current browser tab for presence",
    description=(
        "Updates the authenticated user's per-tab heartbeat and derives the current "
        "online, AFK, or offline status from all live tabs."
    ),
)
async def post_presence_heartbeat(
    request: Request,
    payload: PresenceHeartbeatRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    presence_service: PresenceService = Depends(get_presence_service),
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> PresenceHeartbeatResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    presence_status, change = await presence_service.heartbeat(
        user_id=auth_context.user.id,
        tab_id=payload.tab_id,
        last_interaction_at=payload.last_interaction_at,
    )

    if change is not None:
        subscriber_ids = await list_presence_subscriber_ids(
            db,
            user_id=auth_context.user.id,
        )
        await realtime_manager.broadcast_presence_event(
            user_ids=subscriber_ids,
            subject_user_id=auth_context.user.id,
            presence_status=change.status,
        )

    return PresenceHeartbeatResponse(
        presence_status=presence_status,
        checked_at=datetime.now(UTC),
    )
