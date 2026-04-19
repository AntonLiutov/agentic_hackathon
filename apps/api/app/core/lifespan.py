from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
from typing import AsyncIterator

from fastapi import FastAPI

from app.attachments.service import ensure_attachments_dir
from app.cache.redis import RedisManager
from app.core.config import Settings, get_settings
from app.db.session import DatabaseManager
from app.presence.service import PresenceService, list_presence_subscriber_ids
from app.realtime.manager import RealtimeConnectionManager


async def _run_presence_sweeper(app: FastAPI) -> None:
    while True:
        await asyncio.sleep(app.state.settings.presence_sweep_interval_seconds)

        async with app.state.database.session_factory() as db:
            presence_changes = await app.state.presence.sweep()

            for change in presence_changes:
                subscriber_ids = await list_presence_subscriber_ids(
                    db,
                    user_id=change.user_id,
                )
                await app.state.realtime.broadcast_presence_event(
                    user_ids=subscriber_ids,
                    subject_user_id=change.user_id,
                    presence_status=change.status,
                )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = get_settings()
    ensure_attachments_dir(settings.attachments_dir)
    app.state.settings = settings
    app.state.database = DatabaseManager(settings.database_url)
    app.state.redis = RedisManager(settings.redis_url)
    app.state.realtime = RealtimeConnectionManager()
    app.state.presence = PresenceService(
        redis_manager=app.state.redis,
        settings=settings,
    )
    presence_sweeper_task: asyncio.Task[None] | None = None

    if settings.presence_sweep_enabled:
        presence_sweeper_task = asyncio.create_task(_run_presence_sweeper(app))

    try:
        yield
    finally:
        if presence_sweeper_task is not None:
            presence_sweeper_task.cancel()
            with suppress(asyncio.CancelledError):
                await presence_sweeper_task
        await app.state.realtime.close()
        await app.state.redis.close()
        await app.state.database.dispose()
