from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, Form, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_db_session,
    get_realtime_manager,
    get_settings_from_request,
)
from app.api.schemas.messages import (
    ConversationMessageListResponse,
    ConversationMessageResponse,
    ConversationReadResponse,
    CreateMessageRequest,
    EditMessageRequest,
)
from app.attachments.service import delete_attachment_file, persist_upload
from app.auth.service import get_auth_context
from app.core.config import Settings
from app.db.models.identity import User
from app.messages.service import (
    create_message,
    create_message_with_attachments,
    delete_message,
    edit_message,
    get_message,
    list_conversation_member_ids,
    list_recent_messages,
    mark_conversation_read,
)
from app.realtime.manager import RealtimeConnectionManager

router = APIRouter(tags=["messages"])


async def _build_broadcast_messages_by_user_id(
    db: AsyncSession,
    *,
    realtime_manager: RealtimeConnectionManager,
    conversation_id: UUID,
    message_id: int,
    actor: User,
    actor_message: ConversationMessageResponse,
) -> dict[UUID, ConversationMessageResponse]:
    connected_user_ids = await realtime_manager.get_connected_conversation_user_ids(conversation_id)

    if not connected_user_ids:
        return {}

    messages_by_user_id: dict[UUID, ConversationMessageResponse] = {}

    for user_id in connected_user_ids:
        if user_id == actor.id:
            messages_by_user_id[user_id] = actor_message
            continue

        target_user = (
            await db.execute(
                select(User).where(
                    User.id == user_id,
                    User.deleted_at.is_(None),
                )
            )
        ).scalars().first()

        if target_user is None:
            continue

        messages_by_user_id[user_id] = await get_message(
            db,
            user=target_user,
            message_id=message_id,
        )

    return messages_by_user_id


@router.get(
    "/api/conversations/{conversation_id}/messages",
    response_model=ConversationMessageListResponse,
    summary="List recent messages for a conversation",
    description=(
        "Returns persisted messages for a room or direct message conversation in chronological "
        "order, together with sequence continuity metadata and an optional cursor for older "
        "history."
    ),
)
async def get_conversation_messages(
    conversation_id: UUID,
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    before_sequence: int | None = Query(default=None, ge=1),
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
        before_sequence=before_sequence,
    )


@router.post(
    "/api/conversations/{conversation_id}/read",
    response_model=ConversationReadResponse,
    summary="Mark a conversation as read",
    description=(
        "Clears unread state for the current user by advancing the conversation read marker "
        "to the latest persisted sequence number."
    ),
)
async def post_conversation_read(
    conversation_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> ConversationReadResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await mark_conversation_read(
        db,
        user=auth_context.user,
        conversation_id=conversation_id,
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
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> ConversationMessageResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    message = await create_message(
        db,
        user=auth_context.user,
        conversation_id=conversation_id,
        payload=payload,
    )
    messages_by_user_id = await _build_broadcast_messages_by_user_id(
        db,
        realtime_manager=realtime_manager,
        conversation_id=conversation_id,
        message_id=message.id,
        actor=auth_context.user,
        actor_message=message,
    )
    await realtime_manager.broadcast_message_event(
        conversation_id=conversation_id,
        event_type="message.created",
        messages_by_user_id=messages_by_user_id,
        sequence_head=message.sequence_number,
    )
    recipient_user_ids = [
        user_id
        for user_id in await list_conversation_member_ids(db, conversation_id=conversation_id)
        if user_id != auth_context.user.id
    ]
    await realtime_manager.broadcast_inbox_unread_event(
        user_ids=recipient_user_ids,
        conversation_id=conversation_id,
        sequence_head=message.sequence_number,
    )
    return message


@router.post(
    "/api/conversations/{conversation_id}/messages/attachments",
    response_model=ConversationMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new message with uploaded attachments",
    description=(
        "Uploads one or more attachments to local storage and creates a persisted room or "
        "direct-message record that references them. Body text is optional when at least one "
        "attachment is included."
    ),
)
async def post_conversation_message_with_attachments(
    conversation_id: UUID,
    request: Request,
    files: list[UploadFile] = File(...),
    body_text: str | None = Form(default=None),
    reply_to_message_id: int | None = Form(default=None),
    attachment_comment: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db_session),
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> ConversationMessageResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    normalized_comment = attachment_comment.strip() if attachment_comment else None
    stored_attachments = []
    try:
        for uploaded_file in files:
            stored_attachments.append(
                await persist_upload(
                    uploaded_file,
                    settings=settings,
                    comment_text=normalized_comment,
                )
            )
        message = await create_message_with_attachments(
            db,
            user=auth_context.user,
            conversation_id=conversation_id,
            body_text=body_text,
            reply_to_message_id=reply_to_message_id,
            attachments=stored_attachments,
        )
    except Exception:
        for stored_attachment in stored_attachments:
            delete_attachment_file(
                settings=settings,
                storage_key=stored_attachment.storage_key,
            )
        raise
    messages_by_user_id = await _build_broadcast_messages_by_user_id(
        db,
        realtime_manager=realtime_manager,
        conversation_id=conversation_id,
        message_id=message.id,
        actor=auth_context.user,
        actor_message=message,
    )
    await realtime_manager.broadcast_message_event(
        conversation_id=conversation_id,
        event_type="message.created",
        messages_by_user_id=messages_by_user_id,
        sequence_head=message.sequence_number,
    )
    recipient_user_ids = [
        user_id
        for user_id in await list_conversation_member_ids(db, conversation_id=conversation_id)
        if user_id != auth_context.user.id
    ]
    await realtime_manager.broadcast_inbox_unread_event(
        user_ids=recipient_user_ids,
        conversation_id=conversation_id,
        sequence_head=message.sequence_number,
    )
    return message


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
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> ConversationMessageResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    message = await edit_message(
        db,
        user=auth_context.user,
        message_id=message_id,
        payload=payload,
    )
    messages_by_user_id = await _build_broadcast_messages_by_user_id(
        db,
        realtime_manager=realtime_manager,
        conversation_id=message.conversation_id,
        message_id=message.id,
        actor=auth_context.user,
        actor_message=message,
    )
    await realtime_manager.broadcast_message_event(
        conversation_id=message.conversation_id,
        event_type="message.updated",
        messages_by_user_id=messages_by_user_id,
    )
    return message


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
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> ConversationMessageResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    message = await delete_message(
        db,
        user=auth_context.user,
        message_id=message_id,
    )
    messages_by_user_id = await _build_broadcast_messages_by_user_id(
        db,
        realtime_manager=realtime_manager,
        conversation_id=message.conversation_id,
        message_id=message.id,
        actor=auth_context.user,
        actor_message=message,
    )
    await realtime_manager.broadcast_message_event(
        conversation_id=message.conversation_id,
        event_type="message.deleted",
        messages_by_user_id=messages_by_user_id,
    )
    return message
