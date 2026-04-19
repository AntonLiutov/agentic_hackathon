from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.messages import (
    ConversationMessageListResponse,
    ConversationMessageResponse,
    ConversationReadResponse,
    CreateMessageRequest,
    EditMessageRequest,
    MessageAttachmentResponse,
    MessageReplyReferenceResponse,
)
from app.attachments.service import StoredAttachmentInput
from app.db.models.conversation import Conversation, ConversationMember, DmMetadata
from app.db.models.enums import ConversationType, DmStatus
from app.db.models.identity import User
from app.db.models.message import Attachment, ConversationRead, Message, MessageAttachment
from app.rooms.service import get_room_access_context


@dataclass
class ConversationAccessContext:
    conversation: Conversation
    membership: ConversationMember
    is_room_admin: bool
    dm_status: DmStatus | None


def _utc_now() -> datetime:
    return datetime.now(UTC)


async def _get_conversation(
    db: AsyncSession,
    *,
    conversation_id: UUID,
) -> Conversation | None:
    return await db.get(Conversation, conversation_id)


async def get_conversation_access_context(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    user: User,
) -> ConversationAccessContext:
    conversation = await _get_conversation(db, conversation_id=conversation_id)

    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    membership = await db.get(
        ConversationMember,
        {
            "conversation_id": conversation_id,
            "user_id": user.id,
        },
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    is_room_admin = False
    dm_status: DmStatus | None = None
    if conversation.type == ConversationType.ROOM:
        room_access_context = await get_room_access_context(db, room_id=conversation_id, user=user)
        if room_access_context.membership is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
        is_room_admin = room_access_context.is_admin
    else:
        dm_metadata = await db.get(DmMetadata, conversation_id)
        dm_status = dm_metadata.status if dm_metadata is not None else None

    return ConversationAccessContext(
        conversation=conversation,
        membership=membership,
        is_room_admin=is_room_admin,
        dm_status=dm_status,
    )


def _ensure_direct_message_is_active(access_context: ConversationAccessContext) -> None:
    if (
        access_context.conversation.type == ConversationType.DM
        and access_context.dm_status == DmStatus.FROZEN
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This direct message is read-only right now.",
        )


def _message_projection_query(
    *,
    conversation_id: UUID,
    current_user_id: UUID,
    current_user_is_room_admin: bool,
) -> Select[tuple]:
    author = User.__table__.alias("author")
    reply_message = Message.__table__.alias("reply_message")
    reply_author = User.__table__.alias("reply_author")

    can_delete_expression = case(
        (Message.author_user_id == current_user_id, True),
        else_=current_user_is_room_admin,
    )

    return (
        select(
            Message.id,
            Message.conversation_id,
            Message.author_user_id,
            func.coalesce(author.c.username, "Deleted user"),
            Message.sequence_number,
            Message.body_text,
            Message.reply_to_message_id,
            reply_message.c.id,
            func.coalesce(reply_author.c.username, "Deleted user"),
            reply_message.c.body_text,
            reply_message.c.deleted_at,
            Message.created_at,
            Message.edited_at,
            Message.deleted_at,
            Message.author_user_id == current_user_id,
            can_delete_expression,
        )
        .select_from(Message)
        .outerjoin(author, author.c.id == Message.author_user_id)
        .outerjoin(reply_message, reply_message.c.id == Message.reply_to_message_id)
        .outerjoin(reply_author, reply_author.c.id == reply_message.c.author_user_id)
        .where(Message.conversation_id == conversation_id)
    )


def _build_attachment_response(attachment: Attachment) -> MessageAttachmentResponse:
    is_image = bool(attachment.media_type and attachment.media_type.startswith("image/"))
    content_path = f"/api/attachments/{attachment.id}"

    return MessageAttachmentResponse(
        id=attachment.id,
        original_filename=attachment.original_filename,
        media_type=attachment.media_type,
        size_bytes=attachment.size_bytes,
        comment_text=attachment.comment_text,
        content_path=content_path,
        download_path=f"{content_path}?download=1",
        is_image=is_image,
    )


async def _load_attachments_for_message_ids(
    db: AsyncSession,
    *,
    message_ids: list[int],
) -> dict[int, list[MessageAttachmentResponse]]:
    if not message_ids:
        return {}

    rows = (
        await db.execute(
            select(MessageAttachment.message_id, Attachment)
            .join(Attachment, Attachment.id == MessageAttachment.attachment_id)
            .where(MessageAttachment.message_id.in_(message_ids))
            .order_by(MessageAttachment.message_id.asc(), Attachment.created_at.asc())
        )
    ).all()

    attachments_by_message_id: dict[int, list[MessageAttachmentResponse]] = {}
    for message_id, attachment in rows:
        attachments_by_message_id.setdefault(message_id, []).append(
            _build_attachment_response(attachment)
        )

    return attachments_by_message_id


def _project_message(
    row: tuple,
    *,
    attachments_by_message_id: dict[int, list[MessageAttachmentResponse]],
) -> ConversationMessageResponse:
    (
        message_id,
        conversation_id,
        author_user_id,
        author_username,
        sequence_number,
        body_text,
        reply_to_message_id,
        reply_message_id,
        reply_author_username,
        reply_body_text,
        reply_deleted_at,
        created_at,
        edited_at,
        deleted_at,
        can_edit,
        can_delete,
    ) = row

    reply_reference = None
    if reply_message_id is not None:
        reply_reference = MessageReplyReferenceResponse(
            id=reply_message_id,
            author_username=reply_author_username,
            body_text=reply_body_text,
            deleted_at=reply_deleted_at,
        )

    return ConversationMessageResponse(
        id=message_id,
        conversation_id=conversation_id,
        author_user_id=author_user_id,
        author_username=author_username,
        sequence_number=sequence_number,
        body_text=body_text,
        reply_to_message_id=reply_to_message_id,
        reply_to_message=reply_reference,
        created_at=created_at,
        edited_at=edited_at,
        deleted_at=deleted_at,
        is_edited=edited_at is not None,
        is_deleted=deleted_at is not None,
        can_edit=bool(can_edit) and deleted_at is None,
        can_delete=bool(can_delete) and deleted_at is None,
        attachments=attachments_by_message_id.get(message_id, []),
    )


def _apply_direct_message_read_only_state(
    message: ConversationMessageResponse,
    *,
    access_context: ConversationAccessContext,
) -> ConversationMessageResponse:
    if (
        access_context.conversation.type == ConversationType.DM
        and access_context.dm_status == DmStatus.FROZEN
    ):
        return message.model_copy(update={"can_edit": False, "can_delete": False})

    return message


async def list_recent_messages(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: UUID,
    limit: int = 50,
    before_sequence: int | None = None,
) -> ConversationMessageListResponse:
    access_context = await get_conversation_access_context(
        db,
        conversation_id=conversation_id,
        user=user,
    )
    query = (
        _message_projection_query(
            conversation_id=conversation_id,
            current_user_id=user.id,
            current_user_is_room_admin=access_context.is_room_admin,
        )
        .order_by(Message.sequence_number.desc())
    )

    if before_sequence is not None:
        query = query.where(Message.sequence_number < before_sequence)

    rows = (await db.execute(query.limit(limit + 1))).all()
    has_older = len(rows) > limit
    page_rows = rows[:limit]
    attachments_by_message_id = await _load_attachments_for_message_ids(
        db,
        message_ids=[int(row[0]) for row in page_rows],
    )
    messages = [
        _apply_direct_message_read_only_state(
            _project_message(
                row,
                attachments_by_message_id=attachments_by_message_id,
            ),
            access_context=access_context,
        )
        for row in reversed(page_rows)
    ]
    oldest_loaded_sequence = messages[0].sequence_number if messages else None
    newest_loaded_sequence = messages[-1].sequence_number if messages else None

    return ConversationMessageListResponse(
        conversation_id=conversation_id,
        sequence_head=access_context.conversation.message_sequence_head,
        oldest_loaded_sequence=oldest_loaded_sequence,
        newest_loaded_sequence=newest_loaded_sequence,
        next_before_sequence=oldest_loaded_sequence if has_older else None,
        has_older=has_older,
        messages=messages,
    )


async def _get_reply_target(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    reply_to_message_id: int,
) -> Message:
    reply_target = await db.get(Message, reply_to_message_id)

    if reply_target is None or reply_target.conversation_id != conversation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reply target must belong to the same conversation.",
        )

    return reply_target


async def _next_sequence_number(
    db: AsyncSession,
    *,
    conversation_id: UUID,
) -> int:
    result = await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(message_sequence_head=Conversation.message_sequence_head + 1)
        .returning(Conversation.message_sequence_head)
    )
    next_sequence = result.scalar_one_or_none()

    if next_sequence is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    return int(next_sequence)


async def _set_conversation_read_state(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    user_id: UUID,
    last_read_sequence_number: int,
) -> ConversationRead:
    read_state = await db.get(
        ConversationRead,
        {
            "conversation_id": conversation_id,
            "user_id": user_id,
        },
    )

    if read_state is None:
        read_state = ConversationRead(
            conversation_id=conversation_id,
            user_id=user_id,
        )
        db.add(read_state)

    normalized_sequence = max(
        int(read_state.last_read_sequence_number or 0),
        int(last_read_sequence_number),
    )
    read_state.last_read_sequence_number = normalized_sequence
    read_state.last_opened_at = _utc_now()

    if normalized_sequence <= 0:
        read_state.last_read_message_id = None
        return read_state

    last_message_id = (
        await db.execute(
            select(Message.id).where(
                Message.conversation_id == conversation_id,
                Message.sequence_number == normalized_sequence,
            )
        )
    ).scalar_one_or_none()
    read_state.last_read_message_id = last_message_id
    return read_state


async def mark_conversation_read(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: UUID,
) -> ConversationReadResponse:
    access_context = await get_conversation_access_context(
        db,
        conversation_id=conversation_id,
        user=user,
    )
    sequence_head = int(access_context.conversation.message_sequence_head)
    read_state = await _set_conversation_read_state(
        db,
        conversation_id=conversation_id,
        user_id=user.id,
        last_read_sequence_number=sequence_head,
    )
    await db.commit()

    return ConversationReadResponse(
        conversation_id=conversation_id,
        last_read_sequence_number=int(read_state.last_read_sequence_number),
        unread_count=max(
            0,
            sequence_head - int(read_state.last_read_sequence_number),
        ),
    )


async def list_conversation_member_ids(
    db: AsyncSession,
    *,
    conversation_id: UUID,
) -> list[UUID]:
    rows = await db.execute(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
        )
    )
    return list(rows.scalars().all())


def _normalize_body_text(body_text: str | None) -> str | None:
    if body_text is None:
        return None
    normalized = body_text.strip()
    return normalized or None


def _validate_new_message_content(
    *,
    body_text: str | None,
    attachments: list[StoredAttachmentInput],
) -> None:
    if body_text is None and not attachments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Messages must include text or at least one attachment.",
        )


async def _create_message_record(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: UUID,
    body_text: str | None,
    reply_to_message_id: int | None,
    attachments: list[StoredAttachmentInput],
) -> ConversationMessageResponse:
    access_context = await get_conversation_access_context(
        db,
        conversation_id=conversation_id,
        user=user,
    )

    if reply_to_message_id is not None:
        await _get_reply_target(
            db,
            conversation_id=conversation_id,
            reply_to_message_id=reply_to_message_id,
        )

    _ensure_direct_message_is_active(access_context)

    normalized_body_text = _normalize_body_text(body_text)
    _validate_new_message_content(body_text=normalized_body_text, attachments=attachments)

    sequence_number = await _next_sequence_number(db, conversation_id=conversation_id)
    message = Message(
        conversation_id=conversation_id,
        author_user_id=user.id,
        sequence_number=sequence_number,
        body_text=normalized_body_text,
        reply_to_message_id=reply_to_message_id,
    )
    db.add(message)
    await db.flush()

    for attachment in attachments:
        attachment_record = Attachment(
            storage_key=attachment.storage_key,
            original_filename=attachment.original_filename,
            media_type=attachment.media_type,
            size_bytes=attachment.size_bytes,
            uploader_user_id=user.id,
            comment_text=attachment.comment_text,
        )
        db.add(attachment_record)
        await db.flush()
        db.add(
            MessageAttachment(
                message_id=message.id,
                attachment_id=attachment_record.id,
            )
        )

    await _set_conversation_read_state(
        db,
        conversation_id=conversation_id,
        user_id=user.id,
        last_read_sequence_number=sequence_number,
    )
    await db.commit()

    access_context.conversation.message_sequence_head = sequence_number
    return await get_message(
        db,
        user=user,
        message_id=message.id,
        access_context=access_context,
    )


async def create_message(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: UUID,
    payload: CreateMessageRequest,
) -> ConversationMessageResponse:
    return await _create_message_record(
        db,
        user=user,
        conversation_id=conversation_id,
        body_text=payload.body_text,
        reply_to_message_id=payload.reply_to_message_id,
        attachments=[],
    )


async def create_message_with_attachments(
    db: AsyncSession,
    *,
    user: User,
    conversation_id: UUID,
    body_text: str | None,
    reply_to_message_id: int | None,
    attachments: list[StoredAttachmentInput],
) -> ConversationMessageResponse:
    return await _create_message_record(
        db,
        user=user,
        conversation_id=conversation_id,
        body_text=body_text,
        reply_to_message_id=reply_to_message_id,
        attachments=attachments,
    )


async def get_message(
    db: AsyncSession,
    *,
    user: User,
    message_id: int,
    access_context: ConversationAccessContext | None = None,
) -> ConversationMessageResponse:
    message = await db.get(Message, message_id)

    if message is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found.",
        )

    if access_context is None:
        access_context = await get_conversation_access_context(
            db,
            conversation_id=message.conversation_id,
            user=user,
        )

    query = _message_projection_query(
        conversation_id=message.conversation_id,
        current_user_id=user.id,
        current_user_is_room_admin=access_context.is_room_admin,
    ).where(Message.id == message_id)
    row = (await db.execute(query)).first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found.",
        )

    attachments_by_message_id = await _load_attachments_for_message_ids(
        db,
        message_ids=[message_id],
    )
    return _apply_direct_message_read_only_state(
        _project_message(
            row,
            attachments_by_message_id=attachments_by_message_id,
        ),
        access_context=access_context,
    )


async def edit_message(
    db: AsyncSession,
    *,
    user: User,
    message_id: int,
    payload: EditMessageRequest,
) -> ConversationMessageResponse:
    message = await db.get(Message, message_id)

    if message is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found.",
        )

    access_context = await get_conversation_access_context(
        db,
        conversation_id=message.conversation_id,
        user=user,
    )
    _ensure_direct_message_is_active(access_context)

    if message.author_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the message author can edit this message.",
        )

    if message.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deleted messages cannot be edited.",
        )

    message.body_text = payload.body_text
    message.edited_at = _utc_now()
    await db.commit()

    return await get_message(
        db,
        user=user,
        message_id=message_id,
        access_context=access_context,
    )


async def delete_message(
    db: AsyncSession,
    *,
    user: User,
    message_id: int,
) -> ConversationMessageResponse:
    message = await db.get(Message, message_id)

    if message is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found.",
        )

    access_context = await get_conversation_access_context(
        db,
        conversation_id=message.conversation_id,
        user=user,
    )
    _ensure_direct_message_is_active(access_context)

    can_delete = message.author_user_id == user.id or access_context.is_room_admin
    if not can_delete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this message.",
        )

    if message.deleted_at is None:
        message.body_text = None
        message.deleted_at = _utc_now()
        await db.commit()

    return await get_message(
        db,
        user=user,
        message_id=message_id,
        access_context=access_context,
    )
