from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from app.cache.redis import RedisManager
from app.core.config import Settings, get_settings
from app.db.session import DatabaseManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = get_settings()
    app.state.settings = settings
    app.state.database = DatabaseManager(settings.database_url)
    app.state.redis = RedisManager(settings.redis_url)

    try:
        yield
    finally:
        await app.state.redis.close()
        await app.state.database.dispose()
