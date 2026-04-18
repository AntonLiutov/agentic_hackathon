from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.dms import DirectMessageSummaryResponse
from app.auth.security import normalize_username
from app.db.models.conversation import Conversation, ConversationMember, DmMetadata
from app.db.models.enums import ConversationType, DmStatus
from app.db.models.identity import User
from app.db.models.message import ConversationRead


@dataclass
class _DmProjection:
    conversation_id: UUID
    created_at: datetime
    status: DmStatus
    initiated_by_user_id: UUID | None
    message_sequence_head: int
    last_read_sequence_number: int
    user_one_id: UUID
    user_one_username: str
    user_two_id: UUID
    user_two_username: str


def _order_user_pair(left_user_id: UUID, right_user_id: UUID) -> tuple[UUID, UUID]:
    return (
        (left_user_id, right_user_id)
        if str(left_user_id) < str(right_user_id)
        else (right_user_id, left_user_id)
    )


def _project_dm_summary(
    projection: _DmProjection,
    *,
    current_user_id: UUID,
) -> DirectMessageSummaryResponse:
    if projection.user_one_id == current_user_id:
        counterpart_user_id = projection.user_two_id
        counterpart_username = projection.user_two_username
    else:
        counterpart_user_id = projection.user_one_id
        counterpart_username = projection.user_one_username

    return DirectMessageSummaryResponse(
        id=projection.conversation_id,
        counterpart_user_id=counterpart_user_id,
        counterpart_username=counterpart_username,
        status=projection.status,
        created_at=projection.created_at,
        is_initiator=projection.initiated_by_user_id == current_user_id,
        can_message=projection.status == DmStatus.ACTIVE,
        unread_count=max(
            0,
            int(projection.message_sequence_head) - int(projection.last_read_sequence_number),
        ),
    )


def _dm_projection_query(*, current_user_id: UUID):
    user_one = User.__table__.alias("user_one")
    user_two = User.__table__.alias("user_two")

    return (
        select(
            Conversation.id,
            Conversation.created_at,
            DmMetadata.status,
            DmMetadata.initiated_by_user_id,
            Conversation.message_sequence_head,
            func.coalesce(ConversationRead.last_read_sequence_number, 0),
            DmMetadata.user_one_id,
            user_one.c.username,
            DmMetadata.user_two_id,
            user_two.c.username,
        )
        .join(DmMetadata, DmMetadata.conversation_id == Conversation.id)
        .join(
            ConversationMember,
            and_(
                ConversationMember.conversation_id == Conversation.id,
                ConversationMember.user_id == current_user_id,
            ),
        )
        .outerjoin(
            ConversationRead,
            and_(
                ConversationRead.conversation_id == Conversation.id,
                ConversationRead.user_id == current_user_id,
            ),
        )
        .join(user_one, user_one.c.id == DmMetadata.user_one_id)
        .join(user_two, user_two.c.id == DmMetadata.user_two_id)
        .where(
            Conversation.type == ConversationType.DM,
            or_(
                DmMetadata.user_one_id == current_user_id,
                DmMetadata.user_two_id == current_user_id,
            ),
        )
    )


async def list_direct_messages(
    db: AsyncSession,
    *,
    user: User,
) -> list[DirectMessageSummaryResponse]:
    query = _dm_projection_query(current_user_id=user.id).order_by(Conversation.created_at.desc())
    rows = (await db.execute(query)).all()

    return [
        _project_dm_summary(
            _DmProjection(
                conversation_id=conversation_id,
                created_at=created_at,
                status=dm_status,
                initiated_by_user_id=initiated_by_user_id,
                message_sequence_head=message_sequence_head,
                last_read_sequence_number=last_read_sequence_number,
                user_one_id=user_one_id,
                user_one_username=user_one_username,
                user_two_id=user_two_id,
                user_two_username=user_two_username,
            ),
            current_user_id=user.id,
        )
        for (
            conversation_id,
            created_at,
            dm_status,
            initiated_by_user_id,
            message_sequence_head,
            last_read_sequence_number,
            user_one_id,
            user_one_username,
            user_two_id,
            user_two_username,
        ) in rows
    ]


async def get_direct_message_summary(
    db: AsyncSession,
    *,
    user: User,
    direct_message_id: UUID,
) -> DirectMessageSummaryResponse:
    query = _dm_projection_query(current_user_id=user.id).where(
        Conversation.id == direct_message_id
    )
    row = (await db.execute(query)).first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Direct message not found.",
        )

    return _project_dm_summary(
        _DmProjection(
            conversation_id=row[0],
            created_at=row[1],
            status=row[2],
            initiated_by_user_id=row[3],
            message_sequence_head=row[4],
            last_read_sequence_number=row[5],
            user_one_id=row[6],
            user_one_username=row[7],
            user_two_id=row[8],
            user_two_username=row[9],
        ),
        current_user_id=user.id,
    )


async def open_direct_message(
    db: AsyncSession,
    *,
    user: User,
    target_username: str,
) -> DirectMessageSummaryResponse:
    normalized_username = normalize_username(target_username)
    target_user = (
        await db.execute(
            select(User).where(
                User.username == normalized_username,
                User.deleted_at.is_(None),
            )
        )
    ).scalars().first()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if target_user.id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot create a direct message with yourself.",
        )

    user_one_id, user_two_id = _order_user_pair(user.id, target_user.id)
    existing_dm = (
        await db.execute(
            select(DmMetadata).where(
                DmMetadata.user_one_id == user_one_id,
                DmMetadata.user_two_id == user_two_id,
            )
        )
    ).scalars().first()

    if existing_dm is not None:
        return await get_direct_message_summary(
            db,
            user=user,
            direct_message_id=existing_dm.conversation_id,
        )

    conversation = Conversation(
        type=ConversationType.DM,
        created_by_user_id=user.id,
    )
    db.add(conversation)
    await db.flush()

    db.add(
        DmMetadata(
            conversation_id=conversation.id,
            user_one_id=user_one_id,
            user_two_id=user_two_id,
            status=DmStatus.ACTIVE,
            initiated_by_user_id=user.id,
        )
    )
    db.add(
        ConversationMember(
            conversation_id=conversation.id,
            user_id=user.id,
        )
    )
    db.add(
        ConversationMember(
            conversation_id=conversation.id,
            user_id=target_user.id,
        )
    )

    await db.commit()

    return await get_direct_message_summary(
        db,
        user=user,
        direct_message_id=conversation.id,
    )
