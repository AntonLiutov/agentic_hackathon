from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session, get_realtime_manager, get_settings_from_request
from app.api.schemas.auth import (
    ActionResponse,
    AuthSessionResponse,
    AuthUserResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutResponse,
    PasswordResetTokenStatusResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserSessionsResponse,
)
from app.auth.service import (
    attach_session_cookie,
    change_password,
    clear_session_cookie,
    delete_account,
    get_auth_context,
    list_active_sessions,
    login_user,
    register_user,
    request_password_reset,
    reset_password,
    revoke_session,
    revoke_session_by_id,
    validate_password_reset_token,
)
from app.core.config import Settings
from app.realtime.manager import RealtimeConnectionManager

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=AuthSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account",
    description=(
        "Creates a new account, hashes the password, starts the first authenticated "
        "session, and sets the session cookie."
    ),
)
async def register(
    request: Request,
    response: Response,
    payload: RegisterRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> AuthSessionResponse:
    user, session_token = await register_user(
        db,
        payload=payload,
        settings=settings,
        request=request,
    )
    attach_session_cookie(response, settings=settings, session_token=session_token)
    return AuthSessionResponse(user=AuthUserResponse.model_validate(user))


@router.post(
    "/login",
    response_model=AuthSessionResponse,
    summary="Authenticate with email and password",
    description=(
        "Authenticates the user, creates a new browser session, and sets the session "
        "cookie for subsequent requests."
    ),
)
async def login(
    request: Request,
    response: Response,
    payload: LoginRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> AuthSessionResponse:
    user, session_token = await login_user(
        db,
        payload=payload,
        settings=settings,
        request=request,
    )
    attach_session_cookie(response, settings=settings, session_token=session_token)
    return AuthSessionResponse(user=AuthUserResponse.model_validate(user))


@router.get(
    "/me",
    response_model=AuthSessionResponse,
    summary="Read the current authenticated user",
    description=(
        "Resolves the current user from the session cookie and returns identity "
        "information used for app bootstrap."
    ),
)
async def me(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> AuthSessionResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    return AuthSessionResponse(user=AuthUserResponse.model_validate(auth_context.user))


@router.get(
    "/sessions",
    response_model=UserSessionsResponse,
    summary="List active browser sessions",
    description=(
        "Returns the currently active sessions for the authenticated user, including "
        "metadata for the current browser session and other active devices."
    ),
)
async def list_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> UserSessionsResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=True,
        required=True,
    )
    return UserSessionsResponse(sessions=await list_active_sessions(db, auth_context=auth_context))


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Log out the current browser session",
    description=(
        "Revokes only the active session represented by the current cookie and clears "
        "that cookie from the browser."
    ),
)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> LogoutResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=False,
    )
    await revoke_session(db, auth_context=auth_context)
    clear_session_cookie(response, settings=settings)
    return LogoutResponse()


@router.delete(
    "/sessions/{session_id}",
    response_model=LogoutResponse,
    summary="Revoke a selected browser session",
    description=(
        "Revokes a specific active session owned by the current user without affecting "
        "the current browser session."
    ),
)
async def revoke_selected_session(
    session_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> LogoutResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    await revoke_session_by_id(db, auth_context=auth_context, session_id=session_id)
    return LogoutResponse()


@router.post(
    "/password/change",
    response_model=ActionResponse,
    summary="Change password for the current user",
    description=(
        "Verifies the current password, stores a new password hash, revokes all active "
        "sessions for the user, and clears the current browser cookie."
    ),
)
async def change_current_password(
    request: Request,
    response: Response,
    payload: ChangePasswordRequest = Body(...),
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
    await change_password(db, auth_context=auth_context, payload=payload, settings=settings)
    clear_session_cookie(response, settings=settings)
    return ActionResponse(
        success=True,
        message="Password updated. Please sign in again with your new password.",
    )


@router.post(
    "/password/forgot",
    response_model=ActionResponse,
    summary="Request a password reset link",
    description=(
        "Accepts an email address, sends a password reset email when the account exists, "
        "and does not reveal whether the account exists."
    ),
)
async def forgot_password(
    payload: ForgotPasswordRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> ActionResponse:
    return await request_password_reset(db, payload=payload, settings=settings)


@router.get(
    "/password/reset/{token}",
    response_model=PasswordResetTokenStatusResponse,
    summary="Validate a password reset token",
    description="Checks whether the provided password reset token is still valid.",
)
async def validate_reset_token(
    token: str,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> PasswordResetTokenStatusResponse:
    await validate_password_reset_token(db, settings=settings, token=token)
    return PasswordResetTokenStatusResponse(valid=True)


@router.post(
    "/password/reset",
    response_model=ActionResponse,
    summary="Complete a password reset",
    description=(
        "Consumes a valid reset token, stores a new password hash, revokes all active "
        "sessions for the user, and requires a fresh sign-in."
    ),
)
async def complete_password_reset(
    response: Response,
    payload: ResetPasswordRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> ActionResponse:
    await reset_password(db, payload=payload, settings=settings)
    clear_session_cookie(response, settings=settings)
    return ActionResponse(
        success=True,
        message="Password reset complete. Please sign in with your new password.",
    )


@router.delete(
    "/account",
    response_model=ActionResponse,
    summary="Delete the current account",
    description=(
        "Deletes the authenticated account, removes memberships from other rooms, deletes "
        "owned rooms and their attachments permanently, and clears the current browser cookie."
    ),
)
async def delete_current_account(
    request: Request,
    response: Response,
    payload: DeleteAccountRequest = Body(...),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
    realtime_manager: RealtimeConnectionManager = Depends(get_realtime_manager),
) -> ActionResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )
    await delete_account(
        db,
        auth_context=auth_context,
        payload=payload,
        settings=settings,
    )
    await realtime_manager.broadcast_account_deleted_event(user_id=auth_context.user.id)
    connected_inbox_user_ids = await realtime_manager.get_connected_inbox_user_ids()
    await realtime_manager.broadcast_room_event()
    if connected_inbox_user_ids:
        await realtime_manager.broadcast_friendship_event(
            user_ids=list(connected_inbox_user_ids)
        )
    clear_session_cookie(response, settings=settings)
    return ActionResponse(
        success=True,
        message="Account deleted permanently.",
    )
