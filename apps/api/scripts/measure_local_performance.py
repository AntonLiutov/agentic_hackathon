from __future__ import annotations

import argparse
import asyncio
import json
import math
import statistics
import sys
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import httpx
import redis.asyncio as redis
import websockets

from app.core.config import get_settings
from app.demo.service import DEMO_PASSWORD


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Measure local API performance against a seeded Agentic Chat stack."
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default="http://localhost:8000",
        help="Base HTTP URL for the local API.",
    )
    parser.add_argument(
        "--ws-base-url",
        type=str,
        default=None,
        help="Base WebSocket URL for the local API. Derived from --base-url when omitted.",
    )
    parser.add_argument(
        "--redis-url",
        type=str,
        default=None,
        help="Redis URL used to reset presence state between samples.",
    )
    parser.add_argument(
        "--history-iterations",
        type=int,
        default=10,
        help="Number of sequential history fetch samples to collect.",
    )
    parser.add_argument(
        "--delivery-iterations",
        type=int,
        default=5,
        help="Number of room and DM delivery latency samples to collect.",
    )
    parser.add_argument(
        "--presence-iterations",
        type=int,
        default=5,
        help="Number of presence propagation samples to collect.",
    )
    parser.add_argument(
        "--concurrent-fetches",
        type=int,
        default=300,
        help="Number of concurrent history fetches to issue during the concurrency probe.",
    )
    parser.add_argument(
        "--history-limit",
        type=int,
        default=50,
        help="Page size used for history fetch probes.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=30.0,
        help="HTTP client timeout used during the local performance probe.",
    )
    return parser.parse_args()


def _resolve_redis_url(configured_url: str) -> str:
    if "@redis:" in configured_url:
        return configured_url.replace("@redis:", "@localhost:")
    if configured_url.startswith("redis://redis:"):
        return configured_url.replace("redis://redis:", "redis://localhost:")
    return configured_url


def _derive_ws_base_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return f"{scheme}://{parsed.netloc}"


def _iso_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class SampleStats:
    samples: int
    min_ms: float
    avg_ms: float
    p50_ms: float
    p95_ms: float
    max_ms: float


@dataclass(frozen=True)
class ConcurrentProbeStats:
    samples: int
    total_wall_ms: float
    min_ms: float
    avg_ms: float
    p50_ms: float
    p95_ms: float
    max_ms: float


@dataclass(frozen=True)
class PerformanceSummary:
    history_sequence_head: int
    history_recent_fetch: SampleStats
    history_older_fetch: SampleStats
    concurrent_history_fetch: ConcurrentProbeStats
    room_delivery: SampleStats
    dm_delivery: SampleStats
    presence_propagation: SampleStats
    room_delivery_within_3s: bool
    dm_delivery_within_3s: bool
    presence_propagation_within_2s: bool


def _compute_stats(values_ms: list[float]) -> SampleStats:
    sorted_values = sorted(values_ms)
    return SampleStats(
        samples=len(sorted_values),
        min_ms=round(sorted_values[0], 2),
        avg_ms=round(statistics.fmean(sorted_values), 2),
        p50_ms=round(_percentile(sorted_values, 0.5), 2),
        p95_ms=round(_percentile(sorted_values, 0.95), 2),
        max_ms=round(sorted_values[-1], 2),
    )


def _compute_concurrent_stats(
    values_ms: list[float],
    *,
    total_wall_ms: float,
) -> ConcurrentProbeStats:
    sorted_values = sorted(values_ms)
    return ConcurrentProbeStats(
        samples=len(sorted_values),
        total_wall_ms=round(total_wall_ms, 2),
        min_ms=round(sorted_values[0], 2),
        avg_ms=round(statistics.fmean(sorted_values), 2),
        p50_ms=round(_percentile(sorted_values, 0.5), 2),
        p95_ms=round(_percentile(sorted_values, 0.95), 2),
        max_ms=round(sorted_values[-1], 2),
    )


def _percentile(sorted_values: list[float], percentile: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]

    rank = percentile * (len(sorted_values) - 1)
    lower_index = math.floor(rank)
    upper_index = math.ceil(rank)

    if lower_index == upper_index:
        return sorted_values[lower_index]

    lower_value = sorted_values[lower_index]
    upper_value = sorted_values[upper_index]
    weight = rank - lower_index
    return lower_value + (upper_value - lower_value) * weight


async def _login(client: httpx.AsyncClient, *, email: str) -> dict[str, Any]:
    response = await client.post(
        "/api/auth/login",
        json={
            "email": email,
            "password": DEMO_PASSWORD,
        },
    )
    response.raise_for_status()
    return response.json()["user"]


async def _fetch_room_map(client: httpx.AsyncClient) -> dict[str, str]:
    response = await client.get("/api/rooms/mine")
    response.raise_for_status()
    return {room["name"]: room["id"] for room in response.json()["rooms"]}


async def _fetch_dm_map(client: httpx.AsyncClient) -> dict[str, str]:
    response = await client.get("/api/dms/mine")
    response.raise_for_status()
    return {dm["counterpart_username"]: dm["id"] for dm in response.json()["direct_messages"]}


def _build_cookie_header(client: httpx.AsyncClient) -> str:
    cookie_value = client.cookies.get("agentic_chat_session")
    if cookie_value is None:
        raise RuntimeError("Missing authenticated session cookie.")
    return f"agentic_chat_session={cookie_value}"


async def _measure_history_fetches(
    client: httpx.AsyncClient,
    *,
    history_room_id: str,
    history_iterations: int,
    history_limit: int,
) -> tuple[int, SampleStats, SampleStats]:
    recent_latencies: list[float] = []
    older_latencies: list[float] = []

    first_response = await client.get(
        f"/api/conversations/{history_room_id}/messages",
        params={"limit": history_limit},
    )
    first_response.raise_for_status()
    first_payload = first_response.json()
    sequence_head = first_payload["sequence_head"]
    older_before_sequence = first_payload["next_before_sequence"]

    for _ in range(history_iterations):
        started_at = time.perf_counter()
        response = await client.get(
            f"/api/conversations/{history_room_id}/messages",
            params={"limit": history_limit},
        )
        response.raise_for_status()
        recent_latencies.append((time.perf_counter() - started_at) * 1000)

    if older_before_sequence is None:
        raise RuntimeError("Expected older history cursor for the large-history room.")

    for _ in range(history_iterations):
        started_at = time.perf_counter()
        response = await client.get(
            f"/api/conversations/{history_room_id}/messages",
            params={
                "limit": history_limit,
                "before_sequence": older_before_sequence,
            },
        )
        response.raise_for_status()
        older_latencies.append((time.perf_counter() - started_at) * 1000)

    return (
        sequence_head,
        _compute_stats(recent_latencies),
        _compute_stats(older_latencies),
    )


async def _measure_concurrent_history_fetches(
    client: httpx.AsyncClient,
    *,
    history_room_id: str,
    concurrent_fetches: int,
    history_limit: int,
) -> ConcurrentProbeStats:
    latencies: list[float] = []

    async def _fetch_once() -> None:
        started_at = time.perf_counter()
        response = await client.get(
            f"/api/conversations/{history_room_id}/messages",
            params={"limit": history_limit},
        )
        response.raise_for_status()
        latencies.append((time.perf_counter() - started_at) * 1000)

    wall_started_at = time.perf_counter()
    await asyncio.gather(*[_fetch_once() for _ in range(concurrent_fetches)])
    total_wall_ms = (time.perf_counter() - wall_started_at) * 1000
    return _compute_concurrent_stats(latencies, total_wall_ms=total_wall_ms)


async def _measure_message_delivery(
    *,
    websocket_url: str,
    websocket_cookie: str,
    sender_client: httpx.AsyncClient,
    conversation_id: str,
    iterations: int,
    body_prefix: str,
) -> SampleStats:
    latencies: list[float] = []

    async with websockets.connect(
        websocket_url,
        additional_headers={"Cookie": websocket_cookie},
    ) as websocket:
        subscribed_payload = json.loads(await websocket.recv())
        if subscribed_payload.get("type") != "conversation.subscribed":
            raise RuntimeError("Conversation websocket did not subscribe cleanly.")

        for index in range(iterations):
            body_text = f"{body_prefix} {index} {uuid.uuid4()}"
            started_at = time.perf_counter()
            response = await sender_client.post(
                f"/api/conversations/{conversation_id}/messages",
                json={"body_text": body_text},
            )
            response.raise_for_status()

            while True:
                payload = json.loads(await asyncio.wait_for(websocket.recv(), timeout=5.0))
                if payload.get("type") != "message.created":
                    continue
                if payload.get("message", {}).get("body_text") != body_text:
                    continue
                latencies.append((time.perf_counter() - started_at) * 1000)
                break

    return _compute_stats(latencies)


async def _reset_presence_state(redis_client: redis.Redis, *, user_id: str) -> None:
    tabs_key = f"presence:user:{user_id}:tabs"
    tab_ids = await redis_client.smembers(tabs_key)
    tab_keys = [f"presence:tab:{user_id}:{tab_id}" for tab_id in tab_ids]
    if tab_keys:
        await redis_client.delete(*tab_keys)
    await redis_client.delete(tabs_key, f"presence:user:{user_id}:status")
    await redis_client.srem("presence:users", user_id)


async def _measure_presence_propagation(
    *,
    websocket_url: str,
    websocket_cookie: str,
    subject_client: httpx.AsyncClient,
    subject_user_id: str,
    redis_client: redis.Redis,
    iterations: int,
) -> SampleStats:
    latencies: list[float] = []

    async with websockets.connect(
        websocket_url,
        additional_headers={"Cookie": websocket_cookie},
    ) as websocket:
        subscribed_payload = json.loads(await websocket.recv())
        if subscribed_payload.get("type") != "inbox.subscribed":
            raise RuntimeError("Inbox websocket did not subscribe cleanly.")

        for _ in range(iterations):
            await _reset_presence_state(redis_client, user_id=subject_user_id)
            started_at = time.perf_counter()
            response = await subject_client.post(
                "/api/presence/heartbeat",
                json={
                    "tab_id": f"perf-probe-{uuid.uuid4()}",
                    "last_interaction_at": _iso_now(),
                },
            )
            response.raise_for_status()

            while True:
                payload = json.loads(await asyncio.wait_for(websocket.recv(), timeout=5.0))
                if payload.get("type") != "presence.updated":
                    continue
                if payload.get("user_id") != subject_user_id:
                    continue
                if payload.get("presence_status") != "online":
                    continue
                latencies.append((time.perf_counter() - started_at) * 1000)
                break

    return _compute_stats(latencies)


async def main() -> None:
    args = parse_args()
    settings = get_settings()
    base_url = args.base_url.rstrip("/")
    ws_base_url = (args.ws_base_url or _derive_ws_base_url(base_url)).rstrip("/")
    redis_url = args.redis_url or _resolve_redis_url(settings.redis_url)
    http_limits = httpx.Limits(
        max_keepalive_connections=max(20, min(args.concurrent_fetches, 100)),
        max_connections=max(100, args.concurrent_fetches + 20),
    )
    http_timeout = httpx.Timeout(args.timeout_seconds)

    async with (
        httpx.AsyncClient(
            base_url=base_url,
            follow_redirects=True,
            timeout=http_timeout,
            limits=http_limits,
        ) as alice_client,
        httpx.AsyncClient(
            base_url=base_url,
            follow_redirects=True,
            timeout=http_timeout,
            limits=http_limits,
        ) as bob_client,
    ):
        alice_user = await _login(alice_client, email="demo.alice@demo.agentic.chat")
        await _login(bob_client, email="demo.bob@demo.agentic.chat")

        alice_rooms = await _fetch_room_map(alice_client)
        bob_rooms = await _fetch_room_map(bob_client)
        bob_dms = await _fetch_dm_map(bob_client)

        history_room_id = alice_rooms["demo-history-lab"]
        room_delivery_room_id = bob_rooms["demo-general"]
        dm_id = bob_dms["demo.alice"]

        history_sequence_head, history_recent_fetch, history_older_fetch = (
            await _measure_history_fetches(
                alice_client,
                history_room_id=history_room_id,
                history_iterations=args.history_iterations,
                history_limit=args.history_limit,
            )
        )
        concurrent_history_fetch = await _measure_concurrent_history_fetches(
            alice_client,
            history_room_id=history_room_id,
            concurrent_fetches=args.concurrent_fetches,
            history_limit=args.history_limit,
        )

        room_delivery = await _measure_message_delivery(
            websocket_url=f"{ws_base_url}/ws/conversations/{room_delivery_room_id}",
            websocket_cookie=_build_cookie_header(bob_client),
            sender_client=alice_client,
            conversation_id=room_delivery_room_id,
            iterations=args.delivery_iterations,
            body_prefix="Performance probe room message",
        )
        dm_delivery = await _measure_message_delivery(
            websocket_url=f"{ws_base_url}/ws/conversations/{dm_id}",
            websocket_cookie=_build_cookie_header(bob_client),
            sender_client=alice_client,
            conversation_id=dm_id,
            iterations=args.delivery_iterations,
            body_prefix="Performance probe DM message",
        )

        redis_client = redis.from_url(redis_url, decode_responses=True)
        try:
            presence_propagation = await _measure_presence_propagation(
                websocket_url=f"{ws_base_url}/ws/inbox",
                websocket_cookie=_build_cookie_header(bob_client),
                subject_client=alice_client,
                subject_user_id=alice_user["id"],
                redis_client=redis_client,
                iterations=args.presence_iterations,
            )
        finally:
            await redis_client.aclose()

    summary = PerformanceSummary(
        history_sequence_head=history_sequence_head,
        history_recent_fetch=history_recent_fetch,
        history_older_fetch=history_older_fetch,
        concurrent_history_fetch=concurrent_history_fetch,
        room_delivery=room_delivery,
        dm_delivery=dm_delivery,
        presence_propagation=presence_propagation,
        room_delivery_within_3s=room_delivery.p95_ms < 3000,
        dm_delivery_within_3s=dm_delivery.p95_ms < 3000,
        presence_propagation_within_2s=presence_propagation.p95_ms < 2000,
    )

    print("Local performance probe completed.")
    for key, value in asdict(summary).items():
        print(f"- {key}: {value}")


if __name__ == "__main__":
    if sys.platform.startswith("win") and hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
