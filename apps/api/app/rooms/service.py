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
    RoomBanResponse,
    RoomInvitationResponse,
    RoomMemberResponse,
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
from app.db.models.message import ConversationRead


@dataclass
class _RoomProjection:
    room: RoomMetadata
    member_count: int
    joined_at: datetime | None
    is_banned: bool
    is_admin: bool
    unread_count: int


@dataclass
class RoomAccessContext:
    room: RoomMetadata
    membership: ConversationMember | None
    is_admin: bool
    ban: RoomBan | None


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
        is_admin=projection.is_admin,
        is_banned=projection.is_banned,
        can_join=can_join,
        can_leave=is_member and not is_owner,
        can_manage_members=projection.is_admin,
        joined_at=projection.joined_at,
        unread_count=projection.unread_count if is_member else 0,
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


async def get_room_access_context(
    db: AsyncSession,
    *,
    room_id: UUID,
    user: User,
) -> RoomAccessContext:
    room = await _get_room_metadata(db, room_id=room_id)

    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )

    membership = await _get_membership(db, room_id=room_id, user_id=user.id)
    ban = await _get_room_ban(db, room_id=room_id, user_id=user.id)
    is_admin = membership is not None and await _is_room_admin(db, room_id=room_id, user_id=user.id)

    return RoomAccessContext(
        room=room,
        membership=membership,
        is_admin=is_admin,
        ban=ban,
    )


def require_room_member(context: RoomAccessContext) -> None:
    if context.membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found.",
        )


def require_room_admin(context: RoomAccessContext) -> None:
    require_room_member(context)

    if not context.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only room admins can manage membership in this room.",
        )


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
        unread_count=0,
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
            Conversation.message_sequence_head,
            func.coalesce(ConversationRead.last_read_sequence_number, 0),
        )
        .join(Conversation, Conversation.id == RoomMetadata.conversation_id)
        .outerjoin(counts, counts.c.conversation_id == RoomMetadata.conversation_id)
        .outerjoin(ConversationMember, membership_join)
        .outerjoin(RoomBan, ban_join)
        .outerjoin(
            ConversationRead,
            and_(
                ConversationRead.conversation_id == RoomMetadata.conversation_id,
                ConversationRead.user_id == user.id,
            ),
        )
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
                is_admin=False,
                unread_count=max(
                    0,
                    int(message_sequence_head or 0) - int(last_read_sequence_number or 0),
                )
                if joined_at is not None
                else 0,
            ),
            user_id=user.id,
        )
        for (
            room,
            member_count,
            joined_at,
            ban_id,
            message_sequence_head,
            last_read_sequence_number,
        ) in rows
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
            RoomAdmin.user_id,
            Conversation.message_sequence_head,
            func.coalesce(ConversationRead.last_read_sequence_number, 0),
        )
        .join(Conversation, Conversation.id == RoomMetadata.conversation_id)
        .join(
            ConversationMember,
            and_(
                ConversationMember.conversation_id == RoomMetadata.conversation_id,
                ConversationMember.user_id == user.id,
            ),
        )
        .outerjoin(
            RoomAdmin,
            and_(
                RoomAdmin.room_conversation_id == RoomMetadata.conversation_id,
                RoomAdmin.user_id == user.id,
            ),
        )
        .outerjoin(
            ConversationRead,
            and_(
                ConversationRead.conversation_id == RoomMetadata.conversation_id,
                ConversationRead.user_id == user.id,
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
                is_admin=admin_user_id is not None,
                unread_count=max(
                    0,
                    int(message_sequence_head or 0) - int(last_read_sequence_number or 0),
                ),
            ),
            user_id=user.id,
        )
        for (
            room,
            member_count,
            joined_at,
            admin_user_id,
            message_sequence_head,
            last_read_sequence_number,
        ) in rows
    ]


async def join_public_room(
    db: AsyncSession,
    *,
    user: User,
    room_id: UUID,
) -> RoomSummaryResponse:
    access_context = await get_room_access_context(db, room_id=room_id, user=user)
    room = access_context.room

    if room.visibility != RoomVisibility.PUBLIC:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Private rooms require an invitation.",
        )

    if access_context.ban:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot join this room.",
        )

    if access_context.membership is None:
        db.add(
            ConversationMember(
                conversation_id=room_id,
                user_id=user.id,
            )
        )
        await db.commit()

    room_projection = await get_room_summary(db, user=user, room_id=room_id)
    return room_projection


async def leave_room(
    db: AsyncSession,
    *,
    user: User,
    room_id: UUID,
) -> ActionResponse:
    access_context = await get_room_access_context(db, room_id=room_id, user=user)
    room = access_context.room

    if room.owner_user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room owners cannot leave their own room.",
        )

    require_room_member(access_context)

    await db.delete(access_context.membership)
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
    access_context = await get_room_access_context(db, room_id=room_id, user=user)
    room = access_context.room

    if room.visibility != RoomVisibility.PRIVATE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitations are only required for private rooms.",
        )

    require_room_admin(access_context)

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


async def list_room_members(
    db: AsyncSession,
    *,
    user: User,
    room_id: UUID,
) -> list[RoomMemberResponse]:
    access_context = await get_room_access_context(db, room_id=room_id, user=user)
    require_room_member(access_context)
    room = access_context.room

    admin_subquery = select(RoomAdmin.user_id).where(
        RoomAdmin.room_conversation_id == room_id
    )
    query = (
        select(User, ConversationMember.joined_at)
        .join(ConversationMember, ConversationMember.user_id == User.id)
        .where(ConversationMember.conversation_id == room_id)
        .order_by(ConversationMember.joined_at.asc(), User.username.asc())
    )
    rows = (await db.execute(query)).all()
    admin_ids = set((await db.execute(admin_subquery)).scalars().all())

    return [
        RoomMemberResponse(
            id=member.id,
            username=member.username,
            joined_at=joined_at,
            is_owner=member.id == room.owner_user_id,
            is_admin=member.id in admin_ids,
            can_remove=access_context.is_admin
            and member.id != room.owner_user_id
            and member.id != user.id,
        )
        for member, joined_at in rows
    ]


async def list_room_bans(
    db: AsyncSession,
    *,
    user: User,
    room_id: UUID,
) -> list[RoomBanResponse]:
    access_context = await get_room_access_context(db, room_id=room_id, user=user)
    require_room_admin(access_context)

    banned_by_user = User.__table__.alias("banned_by_user")
    query = (
        select(
            RoomBan,
            User.username,
            banned_by_user.c.username,
        )
        .join(User, User.id == RoomBan.user_id)
        .outerjoin(banned_by_user, banned_by_user.c.id == RoomBan.banned_by_user_id)
        .where(RoomBan.room_conversation_id == room_id)
        .order_by(RoomBan.created_at.desc())
    )
    rows = (await db.execute(query)).all()

    return [
        RoomBanResponse(
            id=ban.id,
            user_id=ban.user_id,
            username=username,
            banned_at=ban.created_at,
            banned_by_username=banned_by_username,
            reason=ban.reason,
        )
        for ban, username, banned_by_username in rows
    ]


async def remove_room_member(
    db: AsyncSession,
    *,
    actor: User,
    room_id: UUID,
    member_user_id: UUID,
) -> ActionResponse:
    access_context = await get_room_access_context(db, room_id=room_id, user=actor)
    require_room_admin(access_context)
    room = access_context.room

    if member_user_id == actor.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use leave room to remove yourself from the conversation.",
        )

    if member_user_id == room.owner_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room owners cannot be removed from their own room.",
        )

    membership = await _get_membership(db, room_id=room_id, user_id=member_user_id)

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room member not found.",
        )

    await db.delete(membership)

    existing_ban = await _get_room_ban(db, room_id=room_id, user_id=member_user_id)
    if existing_ban is None:
        db.add(
            RoomBan(
                room_conversation_id=room_id,
                user_id=member_user_id,
                banned_by_user_id=actor.id,
                reason="Removed by a room admin.",
            )
        )
    else:
        existing_ban.banned_by_user_id = actor.id
        existing_ban.reason = "Removed by a room admin."

    invitations = (
        await db.execute(
            select(RoomInvitation).where(
                RoomInvitation.room_conversation_id == room_id,
                RoomInvitation.invitee_user_id == member_user_id,
                RoomInvitation.status == InvitationStatus.PENDING,
            )
        )
    ).scalars().all()
    for invitation in invitations:
        invitation.status = InvitationStatus.REVOKED

    await db.commit()

    return ActionResponse(
        success=True,
        message="Member removed from the room and banned from rejoining.",
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
            RoomAdmin.user_id,
            Conversation.message_sequence_head,
            func.coalesce(ConversationRead.last_read_sequence_number, 0),
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
        .outerjoin(
            RoomAdmin,
            and_(
                RoomAdmin.room_conversation_id == RoomMetadata.conversation_id,
                RoomAdmin.user_id == user.id,
            ),
        )
        .outerjoin(
            ConversationRead,
            and_(
                ConversationRead.conversation_id == RoomMetadata.conversation_id,
                ConversationRead.user_id == user.id,
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

    (
        room,
        member_count,
        joined_at,
        ban_id,
        admin_user_id,
        message_sequence_head,
        last_read_sequence_number,
    ) = row

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
            is_admin=admin_user_id is not None,
            unread_count=max(
                0,
                int(message_sequence_head or 0) - int(last_read_sequence_number or 0),
            )
            if joined_at is not None
            else 0,
        ),
        user_id=user.id,
    )
