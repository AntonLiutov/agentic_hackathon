from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.presence.service import PresenceService


def _run(coro: object) -> object:
    return asyncio.run(coro)  # type: ignore[arg-type]


def _register_user(
    client: TestClient,
    *,
    email: str,
    username: str,
    password: str = "correct-horse-battery-staple",
) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": password,
        },
    )
    assert response.status_code == 201


def _login_user(
    client: TestClient,
    *,
    email: str,
    password: str = "correct-horse-battery-staple",
) -> None:
    response = client.post(
        "/api/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 200


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


def test_presence_heartbeat_enriches_room_members_and_direct_messages(
    auth_client: TestClient,
) -> None:
    clock = _FakeClock(now=1_000)
    auth_client.app.state.presence = PresenceService(
        redis_manager=_FakeRedisManager(now_provider=lambda: clock.now),  # type: ignore[arg-type]
        settings=auth_client.app.state.settings,
        now_provider=lambda: clock.now,
    )

    _register_user(auth_client, email="presence-owner@example.com", username="presence.owner")
    room_response = auth_client.post(
        "/api/rooms",
        json={
            "name": "presence-room",
            "description": "Room for presence testing.",
            "visibility": "public",
        },
    )
    assert room_response.status_code == 201
    room_id = room_response.json()["id"]

    auth_client.post("/api/auth/logout")
    _register_user(auth_client, email="presence-guest@example.com", username="presence.guest")
    join_response = auth_client.post(f"/api/rooms/{room_id}/join")
    assert join_response.status_code == 200

    heartbeat_response = auth_client.post(
        "/api/presence/heartbeat",
        json={
            "tab_id": "guest-tab-id",
            "last_interaction_at": datetime.fromtimestamp(clock.now, UTC).isoformat(),
        },
    )
    assert heartbeat_response.status_code == 200
    assert heartbeat_response.json()["presence_status"] == "online"

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="presence-owner@example.com")

    members_response = auth_client.get(f"/api/rooms/{room_id}/members")
    assert members_response.status_code == 200
    guest_member = next(
        member
        for member in members_response.json()["members"]
        if member["username"] == "presence.guest"
    )
    assert guest_member["presence_status"] == "online"

    dm_response = auth_client.post("/api/dms", json={"username": "presence.guest"})
    assert dm_response.status_code == 201
    assert dm_response.json()["counterpart_presence_status"] == "online"

    auth_client.post("/api/auth/logout")
    _login_user(auth_client, email="presence-guest@example.com")

    direct_messages_response = auth_client.get("/api/dms/mine")
    assert direct_messages_response.status_code == 200
    assert (
        direct_messages_response.json()["direct_messages"][0]["counterpart_presence_status"]
        == "offline"
    )
