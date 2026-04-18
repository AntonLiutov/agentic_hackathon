from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from app.cache.redis import RedisManager
from app.core.config import Settings, get_settings
from app.db.session import DatabaseManager
from app.realtime.manager import RealtimeConnectionManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = get_settings()
    app.state.settings = settings
    app.state.database = DatabaseManager(settings.database_url)
    app.state.redis = RedisManager(settings.redis_url)
    app.state.realtime = RealtimeConnectionManager()

    try:
        yield
    finally:
        await app.state.realtime.close()
        await app.state.redis.close()
        await app.state.database.dispose()
