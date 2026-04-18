from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from app.core.config import Settings
from app.presence.service import PresenceService


def _run(coro: object) -> object:
    return asyncio.run(coro)  # type: ignore[arg-type]


@dataclass
class _FakeClock:
    now: int


class _FakeRedisClient:
    def __init__(self, *, now_provider) -> None:
        self._now_provider = now_provider
        self._values: dict[str, tuple[str, int | None]] = {}
        self._sets: dict[str, set[str]] = {}

    async def get(self, key: str) -> str | None:
        value = self._values.get(key)

        if value is None:
            return None

        stored_value, expires_at = value

        if expires_at is not None and expires_at <= self._now_provider():
            self._values.pop(key, None)
            return None

        return stored_value

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        expires_at = self._now_provider() + ex if ex is not None else None
        self._values[key] = (value, expires_at)

    async def delete(self, key: str) -> None:
        self._values.pop(key, None)
        self._sets.pop(key, None)

    async def sadd(self, key: str, *members: str) -> None:
        bucket = self._sets.setdefault(key, set())
        bucket.update(members)

    async def smembers(self, key: str) -> set[str]:
        return set(self._sets.get(key, set()))

    async def srem(self, key: str, *members: str) -> None:
        bucket = self._sets.get(key)

        if bucket is None:
            return

        for member in members:
            bucket.discard(member)


class _FakeRedisManager:
    def __init__(self, *, now_provider) -> None:
        self.client = _FakeRedisClient(now_provider=now_provider)


def test_presence_service_derives_online_afk_and_offline_from_tabs() -> None:
    clock = _FakeClock(now=1_000)
    settings = Settings(
        presence_heartbeat_ttl_seconds=75,
        presence_afk_timeout_seconds=60,
        presence_sweep_enabled=False,
    )
    service = PresenceService(
        redis_manager=_FakeRedisManager(now_provider=lambda: clock.now),  # type: ignore[arg-type]
        settings=settings,
        now_provider=lambda: clock.now,
    )
    user_id = uuid4()

    status, _ = _run(
        service.heartbeat(
            user_id=user_id,
            tab_id="tab-one",
            last_interaction_at=datetime.fromtimestamp(995, UTC),
        )
    )
    assert status == "online"

    status, _ = _run(
        service.heartbeat(
            user_id=user_id,
            tab_id="tab-two",
            last_interaction_at=datetime.fromtimestamp(940, UTC),
        )
    )
    assert status == "online"

    clock.now = 1_061
    assert _run(service.get_user_status(user_id)) == "afk"

    clock.now = 1_076
    assert _run(service.get_user_status(user_id)) == "offline"


def test_presence_service_sweep_reports_status_changes() -> None:
    clock = _FakeClock(now=2_000)
    settings = Settings(
        presence_heartbeat_ttl_seconds=75,
        presence_afk_timeout_seconds=60,
        presence_sweep_enabled=False,
    )
    service = PresenceService(
        redis_manager=_FakeRedisManager(now_provider=lambda: clock.now),  # type: ignore[arg-type]
        settings=settings,
        now_provider=lambda: clock.now,
    )
    user_id = uuid4()

    _, initial_change = _run(
        service.heartbeat(
            user_id=user_id,
            tab_id="tab-one",
            last_interaction_at=datetime.fromtimestamp(1_995, UTC),
        )
    )
    assert initial_change is not None
    assert initial_change.status == "online"

    clock.now = 2_061
    changes = _run(service.sweep())
    assert len(changes) == 1
    assert changes[0].user_id == user_id
    assert changes[0].status == "afk"

    clock.now = 2_076
    changes = _run(service.sweep())
    assert len(changes) == 1
    assert changes[0].status == "offline"
