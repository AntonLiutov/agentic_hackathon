from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.auth import ActionResponse
from app.api.schemas.blocks import BlockedUserSummaryResponse, CreateUserBlockRequest
from app.auth.security import normalize_username
from app.db.models.conversation import DmMetadata
from app.db.models.enums import DmStatus, FriendRequestStatus
from app.db.models.identity import User
from app.db.models.social import FriendRequest, Friendship, UserBlock


def _order_user_pair(left_user_id: UUID, right_user_id: UUID) -> tuple[UUID, UUID]:
    return (
        (left_user_id, right_user_id)
        if str(left_user_id) < str(right_user_id)
        else (right_user_id, left_user_id)
    )


async def _get_active_user_by_username(
    db: AsyncSession,
    *,
    username: str,
) -> User | None:
    normalized_username = normalize_username(username)
    return (
        await db.execute(
            select(User).where(
                User.username == normalized_username,
                User.deleted_at.is_(None),
            )
        )
    ).scalars().first()


async def are_users_friends(
    db: AsyncSession,
    *,
    left_user_id: UUID,
    right_user_id: UUID,
) -> bool:
    user_one_id, user_two_id = _order_user_pair(left_user_id, right_user_id)
    friendship_id = (
        await db.execute(
            select(Friendship.id).where(
                Friendship.user_one_id == user_one_id,
                Friendship.user_two_id == user_two_id,
            )
        )
    ).scalar_one_or_none()
    return friendship_id is not None


async def has_block_between_users(
    db: AsyncSession,
    *,
    left_user_id: UUID,
    right_user_id: UUID,
) -> bool:
    block_id = (
        await db.execute(
            select(UserBlock.id).where(
                or_(
                    and_(
                        UserBlock.blocker_user_id == left_user_id,
                        UserBlock.blocked_user_id == right_user_id,
                    ),
                    and_(
                        UserBlock.blocker_user_id == right_user_id,
                        UserBlock.blocked_user_id == left_user_id,
                    ),
                )
            )
        )
    ).scalar_one_or_none()
    return block_id is not None


async def sync_direct_message_status_for_pair(
    db: AsyncSession,
    *,
    left_user_id: UUID,
    right_user_id: UUID,
) -> DmStatus | None:
    user_one_id, user_two_id = _order_user_pair(left_user_id, right_user_id)
    dm_metadata = (
        await db.execute(
            select(DmMetadata).where(
                DmMetadata.user_one_id == user_one_id,
                DmMetadata.user_two_id == user_two_id,
            )
        )
    ).scalars().first()

    if dm_metadata is None:
        return None

    has_friendship = await are_users_friends(
        db,
        left_user_id=left_user_id,
        right_user_id=right_user_id,
    )
    is_blocked = await has_block_between_users(
        db,
        left_user_id=left_user_id,
        right_user_id=right_user_id,
    )
    dm_metadata.status = DmStatus.ACTIVE if has_friendship and not is_blocked else DmStatus.FROZEN
    await db.flush()
    return dm_metadata.status


async def list_blocked_users(
    db: AsyncSession,
    *,
    user: User,
) -> list[BlockedUserSummaryResponse]:
    blocked_user = User.__table__.alias("blocked_user")
    rows = (
        await db.execute(
            select(
                UserBlock.id,
                UserBlock.blocked_user_id,
                blocked_user.c.username,
                UserBlock.reason,
                UserBlock.created_at,
            )
            .join(blocked_user, blocked_user.c.id == UserBlock.blocked_user_id)
            .where(UserBlock.blocker_user_id == user.id)
            .order_by(UserBlock.created_at.desc())
        )
    ).all()

    return [
        BlockedUserSummaryResponse(
            block_id=block_id,
            blocked_user_id=blocked_user_id,
            blocked_username=blocked_username,
            reason=reason,
            blocked_at=created_at,
        )
        for block_id, blocked_user_id, blocked_username, reason, created_at in rows
    ]


async def block_user_by_username(
    db: AsyncSession,
    *,
    user: User,
    payload: CreateUserBlockRequest,
) -> BlockedUserSummaryResponse:
    target_user = await _get_active_user_by_username(db, username=payload.username)

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if target_user.id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot block yourself.",
        )

    existing_block = (
        await db.execute(
            select(UserBlock).where(
                UserBlock.blocker_user_id == user.id,
                UserBlock.blocked_user_id == target_user.id,
            )
        )
    ).scalars().first()
    if existing_block is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already blocked this user.",
        )

    user_one_id, user_two_id = _order_user_pair(user.id, target_user.id)

    await db.execute(
        delete(Friendship).where(
            Friendship.user_one_id == user_one_id,
            Friendship.user_two_id == user_two_id,
        )
    )
    await db.execute(
        update(FriendRequest)
        .where(
            FriendRequest.status == FriendRequestStatus.PENDING,
            or_(
                and_(
                    FriendRequest.requester_user_id == user.id,
                    FriendRequest.recipient_user_id == target_user.id,
                ),
                and_(
                    FriendRequest.requester_user_id == target_user.id,
                    FriendRequest.recipient_user_id == user.id,
                ),
            ),
        )
        .values(status=FriendRequestStatus.CANCELLED)
    )

    user_block = UserBlock(
        blocker_user_id=user.id,
        blocked_user_id=target_user.id,
        reason=payload.reason,
    )
    db.add(user_block)
    await db.flush()
    await sync_direct_message_status_for_pair(
        db,
        left_user_id=user.id,
        right_user_id=target_user.id,
    )
    await db.commit()
    await db.refresh(user_block)

    return BlockedUserSummaryResponse(
        block_id=user_block.id,
        blocked_user_id=target_user.id,
        blocked_username=target_user.username,
        reason=user_block.reason,
        blocked_at=user_block.created_at,
    )


async def unblock_user(
    db: AsyncSession,
    *,
    user: User,
    blocked_user_id: UUID,
) -> ActionResponse:
    user_block = (
        await db.execute(
            select(UserBlock).where(
                UserBlock.blocker_user_id == user.id,
                UserBlock.blocked_user_id == blocked_user_id,
            )
        )
    ).scalars().first()

    if user_block is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blocked user not found.",
        )

    await db.delete(user_block)
    await db.flush()
    await sync_direct_message_status_for_pair(
        db,
        left_user_id=user.id,
        right_user_id=blocked_user_id,
    )
    await db.commit()

    return ActionResponse(success=True, message="User unblocked.")
