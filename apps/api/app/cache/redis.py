from __future__ import annotations

from redis.asyncio import Redis


class RedisManager:
    def __init__(self, redis_url: str) -> None:
        self._client = Redis.from_url(redis_url, encoding="utf-8", decode_responses=True)

    @property
    def client(self) -> Redis:
        return self._client

    async def ping(self) -> bool:
        return bool(await self._client.ping())

    async def close(self) -> None:
        await self._client.aclose()
