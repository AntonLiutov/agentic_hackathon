from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Callable, Literal
from uuid import UUID

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import RedisManager
from app.core.config import Settings
from app.db.models.conversation import ConversationMember

PresenceStatus = Literal["online", "afk", "offline"]


def _current_timestamp() -> int:
    return int(datetime.now(UTC).timestamp())


@dataclass(frozen=True)
class PresenceChange:
    user_id: UUID
    status: PresenceStatus


class PresenceService:
    def __init__(
        self,
        *,
        redis_manager: RedisManager,
        settings: Settings,
        now_provider: Callable[[], int] = _current_timestamp,
    ) -> None:
        self._redis = redis_manager.client
        self._settings = settings
        self._now_provider = now_provider

    def _tab_key(self, user_id: UUID, tab_id: str) -> str:
        return f"presence:tab:{user_id}:{tab_id}"

    def _tabs_key(self, user_id: UUID) -> str:
        return f"presence:user:{user_id}:tabs"

    def _status_key(self, user_id: UUID) -> str:
        return f"presence:user:{user_id}:status"

    @property
    def _tracked_users_key(self) -> str:
        return "presence:users"

    async def heartbeat(
        self,
        *,
        user_id: UUID,
        tab_id: str,
        last_interaction_at: datetime,
    ) -> tuple[PresenceStatus, PresenceChange | None]:
        interaction_timestamp = min(
            int(last_interaction_at.astimezone(UTC).timestamp()),
            self._now_provider(),
        )

        try:
            await self._redis.sadd(self._tracked_users_key, str(user_id))
            await self._redis.sadd(self._tabs_key(user_id), tab_id)
            await self._redis.set(
                self._tab_key(user_id, tab_id),
                str(interaction_timestamp),
                ex=self._settings.presence_heartbeat_ttl_seconds,
            )
            return await self._derive_status(user_id, persist=True)
        except Exception:
            return "offline", None

    async def get_user_status(self, user_id: UUID) -> PresenceStatus:
        try:
            status, _ = await self._derive_status(user_id, persist=False)
            return status
        except Exception:
            return "offline"

    async def get_user_statuses(self, user_ids: list[UUID]) -> dict[UUID, PresenceStatus]:
        statuses: dict[UUID, PresenceStatus] = {}

        for user_id in user_ids:
            statuses[user_id] = await self.get_user_status(user_id)

        return statuses

    async def sweep(self) -> list[PresenceChange]:
        try:
            tracked_user_ids = await self._redis.smembers(self._tracked_users_key)
        except Exception:
            return []

        changes: list[PresenceChange] = []

        for raw_user_id in tracked_user_ids:
            try:
                user_id = UUID(raw_user_id)
            except ValueError:
                await self._redis.srem(self._tracked_users_key, raw_user_id)
                continue

            _, change = await self._derive_status(user_id, persist=True)

            if change is not None:
                changes.append(change)

        return changes

    async def _derive_status(
        self,
        user_id: UUID,
        *,
        persist: bool,
    ) -> tuple[PresenceStatus, PresenceChange | None]:
        active_timestamps = await self._get_live_tab_timestamps(user_id)
        status = self._derive_status_from_timestamps(active_timestamps)

        if not persist:
            return status, None

        previous_status = await self._redis.get(self._status_key(user_id))

        if previous_status == status:
            return status, None

        await self._redis.set(self._status_key(user_id), status)

        if status == "offline" and not active_timestamps:
            await self._redis.delete(self._tabs_key(user_id))
            await self._redis.srem(self._tracked_users_key, str(user_id))

        return status, PresenceChange(user_id=user_id, status=status)

    async def _get_live_tab_timestamps(self, user_id: UUID) -> list[int]:
        tab_ids = list(await self._redis.smembers(self._tabs_key(user_id)))
        live_timestamps: list[int] = []
        stale_tab_ids: list[str] = []

        for tab_id in tab_ids:
            raw_timestamp = await self._redis.get(self._tab_key(user_id, tab_id))

            if raw_timestamp is None:
                stale_tab_ids.append(tab_id)
                continue

            try:
                live_timestamps.append(int(raw_timestamp))
            except (TypeError, ValueError):
                stale_tab_ids.append(tab_id)

        if stale_tab_ids:
            await self._redis.srem(self._tabs_key(user_id), *stale_tab_ids)

        return live_timestamps

    def _derive_status_from_timestamps(self, timestamps: list[int]) -> PresenceStatus:
        if not timestamps:
            return "offline"

        now_timestamp = self._now_provider()
        active_threshold = now_timestamp - self._settings.presence_afk_timeout_seconds

        if any(timestamp >= active_threshold for timestamp in timestamps):
            return "online"

        return "afk"


async def list_presence_subscriber_ids(
    db: AsyncSession,
    *,
    user_id: UUID,
) -> list[UUID]:
    other_memberships = ConversationMember.__table__.alias("other_memberships")

    rows = await db.execute(
        select(distinct(ConversationMember.user_id))
        .join(
            other_memberships,
            other_memberships.c.conversation_id == ConversationMember.conversation_id,
        )
        .where(other_memberships.c.user_id == user_id)
    )
    subscriber_ids = list(rows.scalars().all())

    if user_id not in subscriber_ids:
        subscriber_ids.append(user_id)

    return subscriber_ids
