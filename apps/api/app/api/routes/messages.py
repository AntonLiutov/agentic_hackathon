from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session, get_settings_from_request
from app.api.schemas.messages import (
    ConversationMessageListResponse,
    ConversationMessageResponse,
    CreateMessageRequest,
    EditMessageRequest,
)
from app.auth.service import get_auth_context
from app.core.config import Settings
from app.messages.service import create_message, delete_message, edit_message, list_recent_messages

router = APIRouter(tags=["messages"])


@router.get(
    "/api/conversations/{conversation_id}/messages",
    response_model=ConversationMessageListResponse,
    summary="List recent messages for a conversation",
    description=(
        "Returns the most recent persisted messages for a room or direct message conversation "
        "in chronological order, together with the current sequence head."
    ),
)
async def get_conversation_messages(
    conversation_id: UUID,
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> ConversationMessageListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    return await list_recent_messages(
        db,
        user=auth_context.user,
        conversation_id=conversation_id,
        limit=limit,
    )


@router.post(
    "/api/conversations/{conversation_id}/messages",
    response_model=ConversationMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new message in a conversation",
    description=(
        "Creates a new persisted message for a room or direct message conversation and assigns "
        "the next monotonic per-conversation sequence number."
    ),
)
async def post_conversation_message(
    conversation_id: UUID,
    request: Request,
    payload: CreateMessageRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> ConversationMessageResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await create_message(
        db,
        user=auth_context.user,
        conversation_id=conversation_id,
        payload=payload,
    )


@router.patch(
    "/api/messages/{message_id}",
    response_model=ConversationMessageResponse,
    summary="Edit a message",
    description="Allows the message author to update the body text of a non-deleted message.",
)
async def patch_message(
    message_id: int,
    request: Request,
    payload: EditMessageRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> ConversationMessageResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await edit_message(
        db,
        user=auth_context.user,
        message_id=message_id,
        payload=payload,
    )


@router.delete(
    "/api/messages/{message_id}",
    response_model=ConversationMessageResponse,
    summary="Delete a message",
    description=(
        "Allows the message author to delete a message, and also allows room admins to delete "
        "messages inside room conversations."
    ),
)
async def remove_message(
    message_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> ConversationMessageResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await delete_message(
        db,
        user=auth_context.user,
        message_id=message_id,
    )
