from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.auth import ActionResponse
from app.api.schemas.rooms import (
    CreateRoomInvitationRequest,
    CreateRoomRequest,
    RoomInvitationResponse,
    RoomSummaryResponse,
)
from app.auth.security import normalize_username
from app.db.models.conversation import (
    Conversation,
    ConversationMember,
    RoomAdmin,
    RoomBan,
    RoomInvitation,
    RoomMetadata,
)
from app.db.models.enums import ConversationType, InvitationStatus, RoomVisibility
from app.db.models.identity import User


@dataclass
class _RoomProjection:
    room: RoomMetadata
    member_count: int
    joined_at: datetime | None
    is_banned: bool


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _normalize_room_name(name: str) -> str:
    return name.strip().lower()


def _project_room_summary(
    projection: _RoomProjection,
    *,
    user_id: UUID,
) -> RoomSummaryResponse:
    is_owner = projection.room.owner_user_id == user_id
    is_member = projection.joined_at is not None
    can_join = (
        projection.room.visibility == RoomVisibility.PUBLIC
        and not is_member
        and not projection.is_banned
    )

    return RoomSummaryResponse(
        id=projection.room.conversation_id,
        name=projection.room.name,
        description=projection.room.description,
        visibility=projection.room.visibility,
        owner_user_id=projection.room.owner_user_id,
        member_count=projection.member_count,
        is_member=is_member,
        is_owner=is_owner,
        is_banned=projection.is_banned,
        can_join=can_join,
        can_leave=is_member and not is_owner,
        joined_at=projection.joined_at,
    )


def _room_counts_subquery():
    return (
        select(
            ConversationMember.conversation_id.label("conversation_id"),
            func.count().label("member_count"),
        )
        .group_by(ConversationMember.conversation_id)
        .subquery()
    )


async def _get_room_metadata(
    db: AsyncSession,
    *,
    room_id: UUID,
) -> RoomMetadata | None:
    query = (
        select(RoomMetadata)
        .join(Conversation, Conversation.id == RoomMetadata.conversation_id)
        .where(
            RoomMetadata.conversation_id == room_id,
            Conversation.type == ConversationType.ROOM,
        )
    )
    return (await db.execute(query)).scalars().first()


async def _get_membership(
    db: AsyncSession,
    *,
    room_id: UUID,
    user_id: UUID,
) -> ConversationMember | None:
    return await db.get(
        ConversationMember,
        {
            "conversation_id": room_id,
            "user_id": user_id,
        },
    )


async def _is_room_admin(
    db: AsyncSession,
    *,
    room_id: UUID,
    user_id: UUID,
) -> bool:
    query = select(RoomAdmin).where(
        RoomAdmin.room_conversation_id == room_id,
        RoomAdmin.user_id == user_id,
    )
    return (await db.execute(query)).scalars().first() is not None


async def _get_room_ban(
    db: AsyncSession,
    *,
    room_id: UUID,
    user_id: UUID,
) -> RoomBan | None:
    query = select(RoomBan).where(
        RoomBan.room_conversation_id == room_id,
        RoomBan.user_id == user_id,
    )
    return (await db.execute(query)).scalars().first()


async def create_room(
    db: AsyncSession,
    *,
    user: User,
    payload: CreateRoomRequest,
) -> RoomSummaryResponse:
    normalized_name = _normalize_room_name(payload.name)

    room_conversation = Conversation(
        type=ConversationType.ROOM,
        created_by_user_id=user.id,
    )

    db.add(room_conversation)
    await db.flush()

    room_metadata = RoomMetadata(
        conversation_id=room_conversation.id,
        name=normalized_name,
        description=payload.description,
        visibility=payload.visibility,
        owner_user_id=user.id,
    )
    db.add(room_metadata)
    await db.flush()
    db.add(
        ConversationMember(
            conversation_id=room_conversation.id,
            user_id=user.id,
        )
    )
    db.add(
        RoomAdmin(
            room_conversation_id=room_conversation.id,
            user_id=user.id,
            granted_by_user_id=user.id,
        )
    )

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Room name is already taken.",
        ) from exc

    await db.refresh(room_conversation)

    return RoomSummaryResponse(
        id=room_conversation.id,
        name=normalized_name,
        description=payload.description,
        visibility=payload.visibility,
        owner_user_id=user.id,
        member_count=1,
        is_member=True,
        is_owner=True,
        can_join=False,
        can_leave=False,
        joined_at=room_conversation.created_at,
    )


async def list_public_rooms(
    db: AsyncSession,
    *,
    user: User,
    search: str | None,
) -> list[RoomSummaryResponse]:
    counts = _room_counts_subquery()
    membership_join = and_(
        ConversationMember.conversation_id == RoomMetadata.conversation_id,
        ConversationMember.user_id == user.id,
    )
    ban_join = and_(
        RoomBan.room_conversation_id == RoomMetadata.conversation_id,
        RoomBan.user_id == user.id,
    )

    query = (
        select(
            RoomMetadata,
            func.coalesce(counts.c.member_count, 0),
            ConversationMember.joined_at,
            RoomBan.id,
        )
        .join(Conversation, Conversation.id == RoomMetadata.conversation_id)
        .outerjoin(counts, counts.c.conversation_id == RoomMetadata.conversation_id)
        .outerjoin(ConversationMember, membership_join)
        .outerjoin(RoomBan, ban_join)
        .where(
            Conversation.type == ConversationType.ROOM,
            RoomMetadata.visibility == RoomVisibility.PUBLIC,
        )
        .order_by(RoomMetadata.name.asc())
    )

    if search and search.strip():
        search_value = f"%{search.strip()}%"
        query = query.where(
            or_(
                RoomMetadata.name.ilike(search_value),
                RoomMetadata.description.ilike(search_value),
            )
        )

    rows = (await db.execute(query)).all()
    return [
        _project_room_summary(
            _RoomProjection(
                room=room,
                member_count=int(member_count or 0),
                joined_at=joined_at,
                is_banned=ban_id is not None,
            ),
            user_id=user.id,
        )
        for room, member_count, joined_at, ban_id in rows
    ]


async def list_my_rooms(
    db: AsyncSession,
    *,
    user: User,
) -> list[RoomSummaryResponse]:
    counts = _room_counts_subquery()
    query = (
        select(
            RoomMetadata,
            func.coalesce(counts.c.member_count, 0),
            ConversationMember.joined_at,
        )
        .join(Conversation, Conversation.id == RoomMetadata.conversation_id)
        .join(
            ConversationMember,
            and_(
                ConversationMember.conversation_id == RoomMetadata.conversation_id,
                ConversationMember.user_id == user.id,
            ),
        )
        .outerjoin(counts, counts.c.conversation_id == RoomMetadata.conversation_id)
        .where(Conversation.type == ConversationType.ROOM)
        .order_by(RoomMetadata.name.asc())
    )
    rows = (await db.execute(query)).all()

    return [
        _project_room_summary(
            _RoomProjection(
                room=room,
                member_count=int(member_count or 0),
                joined_at=joined_at,
                is_banned=False,
            ),
            user_id=user.id,
        )
        for room, member_count, joined_at in rows
    ]


async def join_public_room(
    db: AsyncSession,
    *,
    user: User,
    room_id: UUID,
) -> RoomSummaryResponse:
    room = await _get_room_metadata(db, room_id=room_id)

    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )

    if room.visibility != RoomVisibility.PUBLIC:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Private rooms require an invitation.",
        )

    if await _get_room_ban(db, room_id=room_id, user_id=user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot join this room.",
        )

    membership = await _get_membership(db, room_id=room_id, user_id=user.id)

    if membership is None:
        db.add(
            ConversationMember(
                conversation_id=room_id,
                user_id=user.id,
            )
        )
        await db.commit()
        membership = await _get_membership(db, room_id=room_id, user_id=user.id)

    room_projection = await get_room_summary(db, user=user, room_id=room_id)
    return room_projection


async def leave_room(
    db: AsyncSession,
    *,
    user: User,
    room_id: UUID,
) -> ActionResponse:
    room = await _get_room_metadata(db, room_id=room_id)

    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )

    if room.owner_user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room owners cannot leave their own room.",
        )

    membership = await _get_membership(db, room_id=room_id, user_id=user.id)

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of this room.",
        )

    await db.delete(membership)
    await db.commit()

    return ActionResponse(success=True, message="You left the room.")


async def list_room_invitations(
    db: AsyncSession,
    *,
    user: User,
) -> list[RoomInvitationResponse]:
    inviter = User.__table__.alias("inviter")
    query = (
        select(
            RoomInvitation,
            RoomMetadata.name,
            RoomMetadata.description,
            inviter.c.username,
        )
        .join(RoomMetadata, RoomMetadata.conversation_id == RoomInvitation.room_conversation_id)
        .outerjoin(inviter, inviter.c.id == RoomInvitation.inviter_user_id)
        .where(
            RoomInvitation.invitee_user_id == user.id,
            RoomInvitation.status == InvitationStatus.PENDING,
        )
        .order_by(RoomInvitation.created_at.desc())
    )
    rows = (await db.execute(query)).all()

    return [
        RoomInvitationResponse(
            id=invitation.id,
            room_conversation_id=invitation.room_conversation_id,
            room_name=room_name,
            room_description=room_description,
            inviter_username=inviter_username,
            status=invitation.status,
            created_at=invitation.created_at,
        )
        for invitation, room_name, room_description, inviter_username in rows
    ]


async def invite_user_to_private_room(
    db: AsyncSession,
    *,
    user: User,
    room_id: UUID,
    payload: CreateRoomInvitationRequest,
) -> RoomInvitationResponse:
    room = await _get_room_metadata(db, room_id=room_id)

    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )

    if room.visibility != RoomVisibility.PRIVATE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitations are only required for private rooms.",
        )

    membership = await _get_membership(db, room_id=room_id, user_id=user.id)
    is_admin = await _is_room_admin(db, room_id=room_id, user_id=user.id)

    if membership is None or not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only room admins can invite people to this private room.",
        )

    invitee_username = normalize_username(payload.username)
    invitee = (
        await db.execute(
            select(User).where(
                User.username == invitee_username,
                User.deleted_at.is_(None),
            )
        )
    ).scalars().first()

    if invitee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if await _get_room_ban(db, room_id=room_id, user_id=invitee.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This user cannot be invited to the room.",
        )

    if await _get_membership(db, room_id=room_id, user_id=invitee.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This user is already a member of the room.",
        )

    invitation = (
        await db.execute(
            select(RoomInvitation).where(
                RoomInvitation.room_conversation_id == room_id,
                RoomInvitation.invitee_user_id == invitee.id,
            )
        )
    ).scalars().first()

    if invitation is None:
        invitation = RoomInvitation(
            room_conversation_id=room_id,
            inviter_user_id=user.id,
            invitee_user_id=invitee.id,
            invitation_text=payload.message,
            status=InvitationStatus.PENDING,
        )
        db.add(invitation)
    else:
        if invitation.status == InvitationStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A pending invitation already exists for this user.",
            )

        invitation.inviter_user_id = user.id
        invitation.invitation_text = payload.message
        invitation.status = InvitationStatus.PENDING

    await db.commit()
    await db.refresh(invitation)

    return RoomInvitationResponse(
        id=invitation.id,
        room_conversation_id=room_id,
        room_name=room.name,
        room_description=room.description,
        inviter_username=user.username,
        status=invitation.status,
        created_at=invitation.created_at,
    )


async def accept_room_invitation(
    db: AsyncSession,
    *,
    user: User,
    invitation_id: UUID,
) -> RoomSummaryResponse:
    invitation = await db.get(RoomInvitation, invitation_id)

    if invitation is None or invitation.invitee_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found.",
        )

    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation is no longer active.",
        )

    if await _get_room_ban(db, room_id=invitation.room_conversation_id, user_id=user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot join this room.",
        )

    membership = await _get_membership(
        db,
        room_id=invitation.room_conversation_id,
        user_id=user.id,
    )

    if membership is None:
        db.add(
            ConversationMember(
                conversation_id=invitation.room_conversation_id,
                user_id=user.id,
            )
        )

    invitation.status = InvitationStatus.ACCEPTED
    await db.commit()

    return await get_room_summary(
        db,
        user=user,
        room_id=invitation.room_conversation_id,
    )


async def get_room_summary(
    db: AsyncSession,
    *,
    user: User,
    room_id: UUID,
) -> RoomSummaryResponse:
    counts = _room_counts_subquery()
    query = (
        select(
            RoomMetadata,
            func.coalesce(counts.c.member_count, 0),
            ConversationMember.joined_at,
            RoomBan.id,
        )
        .join(Conversation, Conversation.id == RoomMetadata.conversation_id)
        .outerjoin(counts, counts.c.conversation_id == RoomMetadata.conversation_id)
        .outerjoin(
            ConversationMember,
            and_(
                ConversationMember.conversation_id == RoomMetadata.conversation_id,
                ConversationMember.user_id == user.id,
            ),
        )
        .outerjoin(
            RoomBan,
            and_(
                RoomBan.room_conversation_id == RoomMetadata.conversation_id,
                RoomBan.user_id == user.id,
            ),
        )
        .where(
            RoomMetadata.conversation_id == room_id,
            Conversation.type == ConversationType.ROOM,
        )
    )
    row = (await db.execute(query)).first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )

    room, member_count, joined_at, ban_id = row

    if (
        room.visibility == RoomVisibility.PRIVATE
        and joined_at is None
        and room.owner_user_id != user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )

    return _project_room_summary(
        _RoomProjection(
            room=room,
            member_count=int(member_count or 0),
            joined_at=joined_at,
            is_banned=ban_id is not None,
        ),
        user_id=user.id,
    )
