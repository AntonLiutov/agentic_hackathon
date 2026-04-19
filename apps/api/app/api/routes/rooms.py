from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session, get_presence_service, get_settings_from_request
from app.api.schemas.auth import ActionResponse
from app.api.schemas.rooms import (
    CreateRoomInvitationRequest,
    CreateRoomRequest,
    RoomBanListResponse,
    RoomInvitationListResponse,
    RoomInvitationResponse,
    RoomListResponse,
    RoomMemberListResponse,
    RoomSummaryResponse,
)
from app.auth.service import get_auth_context
from app.core.config import Settings
from app.friends.service import get_friendship_states
from app.presence.service import PresenceService
from app.rooms.service import (
    accept_room_invitation,
    create_room,
    get_room_summary,
    invite_user_to_private_room,
    join_public_room,
    leave_room,
    list_my_rooms,
    list_public_rooms,
    list_room_bans,
    list_room_invitations,
    list_room_members,
    remove_room_member,
)

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.get(
    "/mine",
    response_model=RoomListResponse,
    summary="List rooms for the current user",
    description="Returns the rooms the authenticated user currently belongs to.",
)
async def get_my_rooms(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    return RoomListResponse(rooms=await list_my_rooms(db, user=auth_context.user))


@router.get(
    "/public",
    response_model=RoomListResponse,
    summary="Browse public rooms",
    description=(
        "Returns the public room catalog for authenticated users, with optional search "
        "over room names and descriptions."
    ),
)
async def get_public_rooms(
    request: Request,
    search: str | None = Query(default=None, max_length=120),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    return RoomListResponse(
        rooms=await list_public_rooms(db, user=auth_context.user, search=search),
    )


@router.post(
    "",
    response_model=RoomSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a room",
    description=(
        "Creates a public or private room, makes the creator the owner and first member, "
        "and grants owner admin permissions."
    ),
)
async def create_new_room(
    request: Request,
    payload: CreateRoomRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomSummaryResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await create_room(db, user=auth_context.user, payload=payload)


@router.get(
    "/{room_id}",
    response_model=RoomSummaryResponse,
    summary="Read room summary",
    description="Returns the current user's summary view of a room.",
)
async def get_room(
    room_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomSummaryResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    return await get_room_summary(db, user=auth_context.user, room_id=room_id)


@router.get(
    "/{room_id}/members",
    response_model=RoomMemberListResponse,
    summary="List room members",
    description="Returns the current membership of the room for users who still have access to it.",
)
async def get_room_members(
    room_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    presence_service: PresenceService = Depends(get_presence_service),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomMemberListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    members = await list_room_members(db, user=auth_context.user, room_id=room_id)
    presence_by_user_id = await presence_service.get_user_statuses(
        [member.id for member in members]
    )
    friendship_states = await get_friendship_states(
        db,
        user_id=auth_context.user.id,
        target_user_ids=[member.id for member in members],
    )
    return RoomMemberListResponse(
        members=[
            member.model_copy(
                update={
                    "presence_status": presence_by_user_id.get(member.id, "offline"),
                    "friendship_state": friendship_states.get(member.id, "none"),
                }
            )
            for member in members
        ]
    )


@router.get(
    "/{room_id}/bans",
    response_model=RoomBanListResponse,
    summary="List banned users for a room",
    description="Returns the room ban list for users who can manage room membership.",
)
async def get_room_bans(
    room_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomBanListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    return RoomBanListResponse(
        bans=await list_room_bans(db, user=auth_context.user, room_id=room_id)
    )


@router.post(
    "/{room_id}/join",
    response_model=RoomSummaryResponse,
    summary="Join a public room",
    description="Adds the current user to a public room unless they are banned.",
)
async def join_room(
    room_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomSummaryResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await join_public_room(db, user=auth_context.user, room_id=room_id)


@router.post(
    "/{room_id}/leave",
    response_model=ActionResponse,
    summary="Leave a room",
    description="Removes the current user from a room if they are a member and not the owner.",
)
async def leave_selected_room(
    room_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> ActionResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await leave_room(db, user=auth_context.user, room_id=room_id)


@router.delete(
    "/{room_id}/members/{member_user_id}",
    response_model=ActionResponse,
    summary="Remove a room member",
    description=(
        "Removes a member from the room and treats the action as a ban so the user cannot "
        "rejoin without later administrative changes."
    ),
)
async def remove_member(
    room_id: UUID,
    member_user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> ActionResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await remove_room_member(
        db,
        actor=auth_context.user,
        room_id=room_id,
        member_user_id=member_user_id,
    )


@router.get(
    "/invitations/mine",
    response_model=RoomInvitationListResponse,
    summary="List pending room invitations",
    description="Returns pending private-room invitations for the authenticated user.",
)
async def get_my_room_invitations(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomInvitationListResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    return RoomInvitationListResponse(
        invitations=await list_room_invitations(db, user=auth_context.user),
    )


@router.post(
    "/{room_id}/invitations",
    response_model=RoomInvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a user to a private room",
    description="Creates or reissues a pending private-room invitation for the target username.",
)
async def create_private_room_invitation(
    room_id: UUID,
    request: Request,
    payload: CreateRoomInvitationRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomInvitationResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await invite_user_to_private_room(
        db,
        user=auth_context.user,
        room_id=room_id,
        payload=payload,
    )


@router.post(
    "/invitations/{invitation_id}/accept",
    response_model=RoomSummaryResponse,
    summary="Accept a room invitation",
    description="Accepts a pending private-room invitation and adds the user to the room.",
)
async def accept_invitation(
    invitation_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> RoomSummaryResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    return await accept_room_invitation(
        db,
        user=auth_context.user,
        invitation_id=invitation_id,
    )
