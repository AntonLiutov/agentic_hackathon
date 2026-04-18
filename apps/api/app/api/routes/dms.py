from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session, get_presence_service, get_settings_from_request
from app.api.schemas.dms import (
    CreateDirectMessageRequest,
    DirectMessageListResponse,
    DirectMessageSummaryResponse,
)
from app.auth.service import get_auth_context
from app.core.config import Settings
from app.dms.service import (
    get_direct_message_summary,
    list_direct_messages,
    open_direct_message,
)
from app.presence.service import PresenceService

router = APIRouter(prefix="/api/dms", tags=["direct-messages"])


@router.get(
    "/mine",
    response_model=DirectMessageListResponse,
    summary="List direct messages for the current user",
    description="Returns the current user's existing one-to-one direct message conversations.",
)
async def get_my_direct_messages(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    presence_service: PresenceService = Depends(get_presence_service),
    settings: Settings = Depends(get_settings_from_request),
) -> DirectMessageListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    direct_messages = await list_direct_messages(db, user=auth_context.user)
    presence_by_user_id = await presence_service.get_user_statuses(
        [direct_message.counterpart_user_id for direct_message in direct_messages]
    )
    return DirectMessageListResponse(
        direct_messages=[
            direct_message.model_copy(
                update={
                    "counterpart_presence_status": presence_by_user_id.get(
                        direct_message.counterpart_user_id,
                        "offline",
                    )
                }
            )
            for direct_message in direct_messages
        ],
    )


@router.post(
    "",
    response_model=DirectMessageSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Open or create a direct message",
    description=(
        "Creates a one-to-one direct message if one does not exist yet, or returns the "
        "existing conversation for the same participant pair."
    ),
)
async def create_or_open_direct_message(
    request: Request,
    payload: CreateDirectMessageRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    presence_service: PresenceService = Depends(get_presence_service),
    settings: Settings = Depends(get_settings_from_request),
) -> DirectMessageSummaryResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    direct_message = await open_direct_message(
        db,
        user=auth_context.user,
        target_username=payload.username,
    )
    counterpart_status = await presence_service.get_user_status(direct_message.counterpart_user_id)
    return direct_message.model_copy(
        update={"counterpart_presence_status": counterpart_status}
    )


@router.get(
    "/{direct_message_id}",
    response_model=DirectMessageSummaryResponse,
    summary="Read a direct message summary",
    description="Returns the current user's summary view of a direct message conversation.",
)
async def get_direct_message(
    direct_message_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    presence_service: PresenceService = Depends(get_presence_service),
    settings: Settings = Depends(get_settings_from_request),
) -> DirectMessageSummaryResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    direct_message = await get_direct_message_summary(
        db,
        user=auth_context.user,
        direct_message_id=direct_message_id,
    )
    counterpart_status = await presence_service.get_user_status(direct_message.counterpart_user_id)
    return direct_message.model_copy(
        update={"counterpart_presence_status": counterpart_status}
    )
