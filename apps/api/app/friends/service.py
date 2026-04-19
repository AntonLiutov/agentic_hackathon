from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.auth import ActionResponse
from app.api.schemas.friends import (
    CreateFriendRequestRequest,
    FriendRequestSummaryResponse,
    FriendshipState,
    FriendSummaryResponse,
)
from app.auth.security import normalize_username
from app.blocks.service import has_block_between_users, sync_direct_message_status_for_pair
from app.db.models.enums import FriendRequestStatus
from app.db.models.identity import User
from app.db.models.social import FriendRequest, Friendship


def _order_user_pair(left_user_id: UUID, right_user_id: UUID) -> tuple[UUID, UUID]:
    return (
        (left_user_id, right_user_id)
        if str(left_user_id) < str(right_user_id)
        else (right_user_id, left_user_id)
    )


@dataclass(frozen=True)
class _FriendProjection:
    friendship_id: UUID
    user_id: UUID
    username: str
    friends_since: object


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


async def _get_friendship_between(
    db: AsyncSession,
    *,
    left_user_id: UUID,
    right_user_id: UUID,
) -> Friendship | None:
    user_one_id, user_two_id = _order_user_pair(left_user_id, right_user_id)
    return (
        await db.execute(
            select(Friendship).where(
                Friendship.user_one_id == user_one_id,
                Friendship.user_two_id == user_two_id,
            )
        )
    ).scalars().first()


async def list_friends(
    db: AsyncSession,
    *,
    user: User,
) -> list[FriendSummaryResponse]:
    friend_one = User.__table__.alias("friend_one")
    friend_two = User.__table__.alias("friend_two")

    rows = (
        await db.execute(
            select(
                Friendship.id,
                Friendship.created_at,
                Friendship.user_one_id,
                friend_one.c.username,
                Friendship.user_two_id,
                friend_two.c.username,
            )
            .join(friend_one, friend_one.c.id == Friendship.user_one_id)
            .join(friend_two, friend_two.c.id == Friendship.user_two_id)
            .where(
                or_(
                    Friendship.user_one_id == user.id,
                    Friendship.user_two_id == user.id,
                )
            )
            .order_by(Friendship.created_at.desc())
        )
    ).all()

    friends: list[FriendSummaryResponse] = []

    for (
        friendship_id,
        created_at,
        user_one_id,
        user_one_username,
        user_two_id,
        user_two_username,
    ) in rows:
        if user_one_id == user.id:
            friend_user_id = user_two_id
            friend_username = user_two_username
        else:
            friend_user_id = user_one_id
            friend_username = user_one_username

        friends.append(
            FriendSummaryResponse(
                friendship_id=friendship_id,
                user_id=friend_user_id,
                username=friend_username,
                friends_since=created_at,
            )
        )

    return friends


async def list_friend_requests(
    db: AsyncSession,
    *,
    user: User,
) -> tuple[list[FriendRequestSummaryResponse], list[FriendRequestSummaryResponse]]:
    requester = User.__table__.alias("requester")
    recipient = User.__table__.alias("recipient")

    rows = (
        await db.execute(
            select(
                FriendRequest,
                requester.c.username,
                recipient.c.username,
            )
            .join(requester, requester.c.id == FriendRequest.requester_user_id)
            .join(recipient, recipient.c.id == FriendRequest.recipient_user_id)
            .where(
                FriendRequest.status == FriendRequestStatus.PENDING,
                or_(
                    FriendRequest.requester_user_id == user.id,
                    FriendRequest.recipient_user_id == user.id,
                ),
            )
            .order_by(FriendRequest.created_at.desc())
        )
    ).all()

    incoming_requests: list[FriendRequestSummaryResponse] = []
    outgoing_requests: list[FriendRequestSummaryResponse] = []

    for friend_request, requester_username, recipient_username in rows:
        response = FriendRequestSummaryResponse(
            id=friend_request.id,
            requester_user_id=friend_request.requester_user_id,
            requester_username=requester_username,
            recipient_user_id=friend_request.recipient_user_id,
            recipient_username=recipient_username,
            request_text=friend_request.request_text,
            status=friend_request.status,
            created_at=friend_request.created_at,
        )

        if friend_request.recipient_user_id == user.id:
            incoming_requests.append(response)
        else:
            outgoing_requests.append(response)

    return incoming_requests, outgoing_requests


async def send_friend_request(
    db: AsyncSession,
    *,
    user: User,
    payload: CreateFriendRequestRequest,
) -> FriendRequestSummaryResponse:
    target_user = await _get_active_user_by_username(db, username=payload.username)

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if target_user.id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot send a friend request to yourself.",
        )

    if await has_block_between_users(
        db,
        left_user_id=user.id,
        right_user_id=target_user.id,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Friend requests are unavailable because one user blocked the other.",
        )

    if await _get_friendship_between(db, left_user_id=user.id, right_user_id=target_user.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already friends with this user.",
        )

    existing_requests = (
        await db.execute(
            select(FriendRequest).where(
                or_(
                    and_(
                        FriendRequest.requester_user_id == user.id,
                        FriendRequest.recipient_user_id == target_user.id,
                    ),
                    and_(
                        FriendRequest.requester_user_id == target_user.id,
                        FriendRequest.recipient_user_id == user.id,
                    ),
                )
            )
        )
    ).scalars().all()

    for existing_request in existing_requests:
        if existing_request.status != FriendRequestStatus.PENDING:
            continue

        if existing_request.requester_user_id == user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You already sent a friend request to this user.",
            )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user already sent you a friend request.",
        )

    same_direction_request = next(
        (
            existing_request
            for existing_request in existing_requests
            if existing_request.requester_user_id == user.id
            and existing_request.recipient_user_id == target_user.id
        ),
        None,
    )

    if same_direction_request is None:
        friend_request = FriendRequest(
            requester_user_id=user.id,
            recipient_user_id=target_user.id,
            status=FriendRequestStatus.PENDING,
            request_text=payload.message,
        )
        db.add(friend_request)
    else:
        friend_request = same_direction_request
        friend_request.status = FriendRequestStatus.PENDING
        friend_request.request_text = payload.message

    await db.commit()
    await db.refresh(friend_request)

    return FriendRequestSummaryResponse(
        id=friend_request.id,
        requester_user_id=friend_request.requester_user_id,
        requester_username=user.username,
        recipient_user_id=friend_request.recipient_user_id,
        recipient_username=target_user.username,
        request_text=friend_request.request_text,
        status=friend_request.status,
        created_at=friend_request.created_at,
    )


async def accept_friend_request(
    db: AsyncSession,
    *,
    user: User,
    request_id: UUID,
) -> FriendSummaryResponse:
    friend_request = await db.get(FriendRequest, request_id)

    if friend_request is None or friend_request.recipient_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend request not found.",
        )

    if friend_request.status != FriendRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This friend request is no longer active.",
        )

    requester = await db.get(User, friend_request.requester_user_id)

    if requester is None or requester.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if await has_block_between_users(
        db,
        left_user_id=user.id,
        right_user_id=requester.id,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Friend requests are unavailable because one user blocked the other.",
        )

    existing_friendship = await _get_friendship_between(
        db,
        left_user_id=user.id,
        right_user_id=requester.id,
    )

    if existing_friendship is None:
        user_one_id, user_two_id = _order_user_pair(user.id, requester.id)
        existing_friendship = Friendship(
            user_one_id=user_one_id,
            user_two_id=user_two_id,
        )
        db.add(existing_friendship)
        await db.flush()

    friend_request.status = FriendRequestStatus.ACCEPTED
    await sync_direct_message_status_for_pair(
        db,
        left_user_id=user.id,
        right_user_id=requester.id,
    )
    await db.commit()
    await db.refresh(existing_friendship)

    return FriendSummaryResponse(
        friendship_id=existing_friendship.id,
        user_id=requester.id,
        username=requester.username,
        friends_since=existing_friendship.created_at,
    )


async def reject_friend_request(
    db: AsyncSession,
    *,
    user: User,
    request_id: UUID,
) -> ActionResponse:
    friend_request = await db.get(FriendRequest, request_id)

    if friend_request is None or friend_request.recipient_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend request not found.",
        )

    if friend_request.status != FriendRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This friend request is no longer active.",
        )

    friend_request.status = FriendRequestStatus.REJECTED
    await db.commit()

    return ActionResponse(success=True, message="Friend request rejected.")


async def remove_friend(
    db: AsyncSession,
    *,
    user: User,
    friend_user_id: UUID,
) -> ActionResponse:
    friendship = await _get_friendship_between(
        db,
        left_user_id=user.id,
        right_user_id=friend_user_id,
    )

    if friendship is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friendship not found.",
        )

    await db.execute(delete(Friendship).where(Friendship.id == friendship.id))
    await sync_direct_message_status_for_pair(
        db,
        left_user_id=user.id,
        right_user_id=friend_user_id,
    )
    await db.commit()

    return ActionResponse(success=True, message="Friend removed.")


async def get_friendship_states(
    db: AsyncSession,
    *,
    user_id: UUID,
    target_user_ids: list[UUID],
) -> dict[UUID, FriendshipState]:
    if not target_user_ids:
        return {}

    states: dict[UUID, FriendshipState] = {}
    normalized_target_user_ids = list(dict.fromkeys(target_user_ids))

    for target_user_id in normalized_target_user_ids:
        if target_user_id == user_id:
            states[target_user_id] = "self"
        else:
            states[target_user_id] = "none"

    friendship_rows = (
        await db.execute(
            select(Friendship.user_one_id, Friendship.user_two_id).where(
                or_(
                    and_(
                        Friendship.user_one_id == user_id,
                        Friendship.user_two_id.in_(normalized_target_user_ids),
                    ),
                    and_(
                        Friendship.user_two_id == user_id,
                        Friendship.user_one_id.in_(normalized_target_user_ids),
                    ),
                )
            )
        )
    ).all()

    for user_one_id, user_two_id in friendship_rows:
        target_user_id = user_two_id if user_one_id == user_id else user_one_id
        states[target_user_id] = "friend"

    pending_request_rows = (
        await db.execute(
            select(
                FriendRequest.requester_user_id,
                FriendRequest.recipient_user_id,
            ).where(
                FriendRequest.status == FriendRequestStatus.PENDING,
                or_(
                    and_(
                        FriendRequest.requester_user_id == user_id,
                        FriendRequest.recipient_user_id.in_(normalized_target_user_ids),
                    ),
                    and_(
                        FriendRequest.recipient_user_id == user_id,
                        FriendRequest.requester_user_id.in_(normalized_target_user_ids),
                    ),
                ),
            )
        )
    ).all()

    for requester_user_id, recipient_user_id in pending_request_rows:
        if requester_user_id == user_id:
            states[recipient_user_id] = "outgoing_request"
        elif states.get(requester_user_id) != "friend":
            states[requester_user_id] = "incoming_request"

    return states
