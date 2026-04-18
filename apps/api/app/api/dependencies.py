from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import DatabaseManager
from app.presence.service import PresenceService
from app.realtime.manager import RealtimeConnectionManager


def get_settings_from_request(request: Request) -> Settings:
    return request.app.state.settings


def get_database_manager(request: Request) -> DatabaseManager:
    return request.app.state.database


def get_realtime_manager(request: Request) -> RealtimeConnectionManager:
    return request.app.state.realtime


def get_presence_service(request: Request) -> PresenceService:
    return request.app.state.presence


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    session_factory = get_database_manager(request).session_factory

    async with session_factory() as session:
        yield session
