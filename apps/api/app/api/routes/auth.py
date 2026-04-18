from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session, get_settings_from_request
from app.api.schemas.auth import (
    AuthSessionResponse,
    AuthUserResponse,
    LoginRequest,
    LogoutResponse,
    RegisterRequest,
    UserSessionsResponse,
)
from app.auth.service import (
    attach_session_cookie,
    clear_session_cookie,
    get_auth_context,
    list_active_sessions,
    login_user,
    register_user,
    revoke_session,
    revoke_session_by_id,
)
from app.core.config import Settings

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
