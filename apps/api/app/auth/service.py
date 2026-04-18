from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.auth import (
    ActionResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserSessionResponse,
)
from app.auth.security import (
    generate_session_token,
    generate_token_pair,
    hash_password,
    hash_session_token,
    hash_token_value,
    normalize_email,
    normalize_username,
    verify_password,
)
from app.core.config import Settings
from app.db.models.identity import PasswordResetToken, User, UserCredential, UserSession
from app.services.mail import send_password_reset_email


@dataclass
class AuthContext:
    user: User
    session: UserSession


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _password_reset_request_message(settings: Settings) -> str:
    if settings.smtp_host.strip().lower() == "mailpit":
        return (
            "If an account exists for this email, check Mailpit at "
            "http://localhost:8025 for the reset link."
        )

    return "If an account exists for this email, check the inbox for a reset link."


def _build_session_record(
    *,
    user: User,
    settings: Settings,
    request: Request,
) -> tuple[UserSession, str]:
    issued_at = _utc_now()
    token_pair = generate_session_token(secret_key=settings.session_secret_key)
    session_record = UserSession(
        user_id=user.id,
        session_token_hash=token_pair.token_hash,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        last_seen_at=issued_at,
        expires_at=issued_at + timedelta(seconds=settings.session_ttl_seconds),
    )
    return session_record, token_pair.plain_token


def attach_session_cookie(
    response: Response,
    *,
    settings: Settings,
    session_token: str,
) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        samesite=settings.session_cookie_samesite,
        secure=settings.session_cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response, *, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        samesite=settings.session_cookie_samesite,
        secure=settings.session_cookie_secure,
        path="/",
    )


async def _revoke_all_user_sessions(db: AsyncSession, *, user_id: UUID) -> None:
    active_sessions = (
        await db.execute(
            select(UserSession).where(
                and_(
                    UserSession.user_id == user_id,
                    UserSession.revoked_at.is_(None),
                )
            )
        )
    ).scalars().all()
    revoked_at = _utc_now()

    for session in active_sessions:
        session.revoked_at = revoked_at


async def _mark_existing_reset_tokens_used(db: AsyncSession, *, user_id: UUID) -> None:
    issued_tokens = (
        await db.execute(
            select(PasswordResetToken).where(
                and_(
                    PasswordResetToken.user_id == user_id,
                    PasswordResetToken.used_at.is_(None),
                )
            )
        )
    ).scalars().all()
    used_at = _utc_now()

    for token in issued_tokens:
        token.used_at = used_at


async def _get_user_and_credential_by_email(
    db: AsyncSession,
    *,
    email: str,
) -> tuple[User, UserCredential] | None:
    query = (
        select(User, UserCredential)
        .join(UserCredential, UserCredential.user_id == User.id)
        .where(
            User.email == email,
            User.deleted_at.is_(None),
        )
    )
    return (await db.execute(query)).first()


async def _resolve_reset_token(
    db: AsyncSession,
    *,
    settings: Settings,
    token: str,
) -> tuple[PasswordResetToken, User] | None:
    token_hash = hash_token_value(token, secret_key=settings.session_secret_key)
    now = _utc_now()
    row = (
        await db.execute(
            select(PasswordResetToken, User)
            .join(User, User.id == PasswordResetToken.user_id)
            .where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
                User.deleted_at.is_(None),
            )
        )
    ).first()
    return row


async def register_user(
    db: AsyncSession,
    *,
    payload: RegisterRequest,
    settings: Settings,
    request: Request,
) -> tuple[User, str]:
    normalized_email = normalize_email(payload.email)
    normalized_username = normalize_username(payload.username)

    duplicate_query = select(User).where(
        or_(User.email == normalized_email, User.username == normalized_username),
    )
    existing_user = (await db.execute(duplicate_query)).scalars().first()

    if existing_user:
        if existing_user.email == normalized_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email is already registered.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken.",
        )

    user = User(
        email=normalized_email,
        username=normalized_username,
    )
    password_hash = hash_password(
        payload.password,
        iterations=settings.password_hash_iterations,
    )

    db.add(user)
    await db.flush()

    session_record, plain_token = _build_session_record(
        user=user,
        settings=settings,
        request=request,
    )

    db.add(UserCredential(user_id=user.id, password_hash=password_hash))
    db.add(session_record)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with these credentials already exists.",
        ) from exc

    return user, plain_token


async def login_user(
    db: AsyncSession,
    *,
    payload: LoginRequest,
    settings: Settings,
    request: Request,
) -> tuple[User, str]:
    normalized_email = normalize_email(payload.email)
    row = await _get_user_and_credential_by_email(db, email=normalized_email)

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    user, credential = row

    if not verify_password(payload.password, credential.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    session_record, plain_token = _build_session_record(
        user=user,
        settings=settings,
        request=request,
    )
    db.add(session_record)
    await db.commit()

    return user, plain_token


async def get_auth_context(
    db: AsyncSession,
    *,
    settings: Settings,
    session_token: str | None,
    touch_session: bool,
    required: bool,
) -> AuthContext | None:
    if not session_token:
        if required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required.",
            )
        return None

    token_hash = hash_session_token(session_token, secret_key=settings.session_secret_key)
    now = _utc_now()
    query = (
        select(UserSession, User)
        .join(User, User.id == UserSession.user_id)
        .where(
            and_(
                UserSession.session_token_hash == token_hash,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
                User.deleted_at.is_(None),
            )
        )
    )
    row = (await db.execute(query)).first()

    if row is None:
        if required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required.",
            )
        return None

    user_session, user = row

    if touch_session:
        user_session.last_seen_at = now
        await db.commit()

    return AuthContext(user=user, session=user_session)


async def revoke_session(
    db: AsyncSession,
    *,
    auth_context: AuthContext | None,
) -> None:
    if auth_context is None:
        return

    auth_context.session.revoked_at = _utc_now()
    await db.commit()


async def list_active_sessions(
    db: AsyncSession,
    *,
    auth_context: AuthContext,
) -> list[UserSessionResponse]:
    now = _utc_now()
    query = (
        select(UserSession)
        .where(
            and_(
                UserSession.user_id == auth_context.user.id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
        )
        .order_by(UserSession.created_at.desc())
    )
    sessions = (await db.execute(query)).scalars().all()

    return [
        UserSessionResponse(
            id=session.id,
            user_agent=session.user_agent,
            ip_address=session.ip_address,
            created_at=session.created_at,
            last_seen_at=session.last_seen_at,
            expires_at=session.expires_at,
            is_current=session.id == auth_context.session.id,
        )
        for session in sessions
    ]


async def revoke_session_by_id(
    db: AsyncSession,
    *,
    auth_context: AuthContext,
    session_id: UUID,
) -> None:
    if session_id == auth_context.session.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use sign out to end the current browser session.",
        )

    now = _utc_now()
    query = select(UserSession).where(
        and_(
            UserSession.id == session_id,
            UserSession.user_id == auth_context.user.id,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
    )
    session_to_revoke = (await db.execute(query)).scalars().first()

    if session_to_revoke is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active session not found.",
        )

    session_to_revoke.revoked_at = now
    await db.commit()


async def change_password(
    db: AsyncSession,
    *,
    auth_context: AuthContext,
    payload: ChangePasswordRequest,
    settings: Settings,
) -> None:
    credential = await db.get(UserCredential, auth_context.user.id)

    if credential is None or not verify_password(
        payload.current_password,
        credential.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    if verify_password(payload.new_password, credential.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )

    credential.password_hash = hash_password(
        payload.new_password,
        iterations=settings.password_hash_iterations,
    )
    await _mark_existing_reset_tokens_used(db, user_id=auth_context.user.id)
    await _revoke_all_user_sessions(db, user_id=auth_context.user.id)
    await db.commit()


async def request_password_reset(
    db: AsyncSession,
    *,
    payload: ForgotPasswordRequest,
    settings: Settings,
) -> ActionResponse:
    normalized_email = normalize_email(payload.email)
    row = await _get_user_and_credential_by_email(db, email=normalized_email)
    message = _password_reset_request_message(settings)

    if row is None:
        return ActionResponse(success=True, message=message)

    user, _credential = row
    await _mark_existing_reset_tokens_used(db, user_id=user.id)
    token_pair = generate_token_pair(secret_key=settings.session_secret_key)
    expires_at = _utc_now() + timedelta(seconds=settings.password_reset_token_ttl_seconds)
    reset_url = f"{settings.password_reset_base_url}?token={token_pair.plain_token}"

    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=token_pair.token_hash,
            expires_at=expires_at,
        )
    )
    await db.commit()

    try:
        await send_password_reset_email(
            settings=settings,
            recipient_email=user.email,
            username=user.username,
            reset_url=reset_url,
            expires_in_seconds=settings.password_reset_token_ttl_seconds,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send the password reset email right now.",
        ) from exc

    return ActionResponse(
        success=True,
        message=message,
    )


async def validate_password_reset_token(
    db: AsyncSession,
    *,
    settings: Settings,
    token: str,
) -> None:
    row = await _resolve_reset_token(db, settings=settings, token=token)

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or expired.",
        )


async def reset_password(
    db: AsyncSession,
    *,
    payload: ResetPasswordRequest,
    settings: Settings,
) -> None:
    row = await _resolve_reset_token(db, settings=settings, token=payload.token)

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or expired.",
        )

    reset_token, user = row
    credential = await db.get(UserCredential, user.id)

    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or expired.",
        )

    credential.password_hash = hash_password(
        payload.new_password,
        iterations=settings.password_hash_iterations,
    )
    reset_token.used_at = _utc_now()
    await _mark_existing_reset_tokens_used(db, user_id=user.id)
    await _revoke_all_user_sessions(db, user_id=user.id)
    await db.commit()
