from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_db_session,
    get_presence_service,
    get_realtime_manager,
    get_settings_from_request,
)
from app.api.schemas.auth import ActionResponse
from app.api.schemas.friends import (
    CreateFriendRequestRequest,
    FriendListResponse,
    FriendRequestListResponse,
    FriendRequestSummaryResponse,
    FriendSummaryResponse,
)
from app.auth.service import get_auth_context
from app.core.config import Settings
from app.friends.service import (
    accept_friend_request,
    list_friend_requests,
    list_friends,
    reject_friend_request,
    remove_friend,
    send_friend_request,
)
from app.presence.service import PresenceService
from app.realtime.manager import RealtimeConnectionManager

router = APIRouter(prefix="/api/friends", tags=["friends"])


@router.get(
    "",
    response_model=FriendListResponse,
    summary="List confirmed friends",
    description="Returns the authenticated user's confirmed friend list.",
)
async def get_friends(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    presence_service: PresenceService = Depends(get_presence_service),
    settings: Settings = Depends(get_settings_from_request),
) -> FriendListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    friends = await list_friends(db, user=auth_context.user)
    presence_by_user_id = await presence_service.get_user_statuses(
        [friend.user_id for friend in friends]
    )
    return FriendListResponse(
        friends=[
            friend.model_copy(
                update={"presence_status": presence_by_user_id.get(friend.user_id, "offline")}
            )
            for friend in friends
        ]
    )


@router.get(
    "/requests",
    response_model=FriendRequestListResponse,
    summary="List incoming and outgoing friend requests",
    description="Returns pending incoming and outgoing friend requests for the authenticated user.",
)
async def get_friend_requests(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> FriendRequestListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    incoming_requests, outgoing_requests = await list_friend_requests(db, user=auth_context.user)
    return FriendRequestListResponse(
        incoming_requests=incoming_requests,
        outgoing_requests=outgoing_requests,
    )


@router.post(
    "/requests",
    response_model=FriendRequestSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a friend request",
    description=(
        "Creates or reissues a friend request by target username, with an optional message."
    ),
)
async def create_friend_request(
    request: Request,
    payload: CreateFriendRequestRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> FriendRequestSummaryResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    friend_request = await send_friend_request(db, user=auth_context.user, payload=payload)
    await realtime_manager.broadcast_friendship_event(
        user_ids=[
            auth_context.user.id,
            friend_request.recipient_user_id,
        ]
    )
    return friend_request


@router.post(
    "/requests/{request_id}/accept",
    response_model=FriendSummaryResponse,
    summary="Accept a friend request",
    description="Accepts a pending incoming friend request and creates a confirmed friendship.",
)
async def accept_request(
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    presence_service: PresenceService = Depends(get_presence_service),
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> FriendSummaryResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    friend = await accept_friend_request(db, user=auth_context.user, request_id=request_id)
    presence_status = await presence_service.get_user_status(friend.user_id)
    await realtime_manager.broadcast_friendship_event(
        user_ids=[
            auth_context.user.id,
            friend.user_id,
        ]
    )
    return friend.model_copy(update={"presence_status": presence_status})


@router.post(
    "/requests/{request_id}/reject",
    response_model=ActionResponse,
    summary="Reject a friend request",
    description="Rejects a pending incoming friend request.",
)
async def reject_request(
    request_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> ActionResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    request_lists = await list_friend_requests(db, user=auth_context.user)
    target_request = next(
        (
            friend_request
            for friend_request in request_lists[0]
            if friend_request.id == request_id
        ),
        None,
    )
    action = await reject_friend_request(db, user=auth_context.user, request_id=request_id)
    if target_request is not None:
        await realtime_manager.broadcast_friendship_event(
            user_ids=[
                auth_context.user.id,
                target_request.requester_user_id,
            ]
        )
    return action


@router.delete(
    "/{friend_user_id}",
    response_model=ActionResponse,
    summary="Remove a friend",
    description="Deletes a confirmed friendship between the authenticated user and the given user.",
)
async def delete_friend(
    friend_user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> ActionResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    action = await remove_friend(db, user=auth_context.user, friend_user_id=friend_user_id)
    await realtime_manager.broadcast_friendship_event(
        user_ids=[
            auth_context.user.id,
            friend_user_id,
        ]
    )
    return action
