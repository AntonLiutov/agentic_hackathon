from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session, get_realtime_manager, get_settings_from_request
from app.api.schemas.auth import ActionResponse
from app.api.schemas.blocks import (
    BlockedUserListResponse,
    BlockedUserSummaryResponse,
    CreateUserBlockRequest,
)
from app.auth.service import get_auth_context
from app.blocks.service import block_user_by_username, list_blocked_users, unblock_user
from app.core.config import Settings
from app.realtime.manager import RealtimeConnectionManager

router = APIRouter(prefix="/api/blocks", tags=["blocks"])


@router.get(
    "",
    response_model=BlockedUserListResponse,
    summary="List blocked users",
    description="Returns the authenticated user's personal block list.",
)
async def get_blocked_users(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> BlockedUserListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    blocked_users = await list_blocked_users(db, user=auth_context.user)
    return BlockedUserListResponse(blocked_users=blocked_users)


@router.post(
    "",
    response_model=BlockedUserSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Block another user",
    description=(
        "Blocks a user by username, terminates the friendship, cancels pending requests, "
        "and freezes any existing direct message."
    ),
)
async def create_user_block(
    request: Request,
    payload: CreateUserBlockRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
    settings: Settings = Depends(get_settings_from_request),
) -> BlockedUserSummaryResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    blocked_user = await block_user_by_username(db, user=auth_context.user, payload=payload)
    await realtime_manager.broadcast_friendship_event(
        user_ids=[auth_context.user.id, blocked_user.blocked_user_id]
    )
    return blocked_user


@router.delete(
    "/{blocked_user_id}",
    response_model=ActionResponse,
    summary="Unblock a user",
    description="Removes a user from the authenticated user's block list.",
)
async def delete_user_block(
    blocked_user_id: UUID,
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
    action = await unblock_user(db, user=auth_context.user, blocked_user_id=blocked_user_id)
    await realtime_manager.broadcast_friendship_event(
        user_ids=[auth_context.user.id, blocked_user_id]
    )
    return action
