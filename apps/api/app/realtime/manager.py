from __future__ import annotations

import asyncio
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

from app.api.schemas.messages import ConversationMessageResponse


class RealtimeConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, conversation_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()

        async with self._lock:
            self._connections[conversation_id].add(websocket)

    async def disconnect(self, conversation_id: UUID, websocket: WebSocket) -> None:
        async with self._lock:
            connections = self._connections.get(conversation_id)

            if not connections:
                return

            connections.discard(websocket)

            if not connections:
                self._connections.pop(conversation_id, None)

    async def broadcast_message_event(
        self,
        *,
        conversation_id: UUID,
        event_type: str,
        message: ConversationMessageResponse,
        sequence_head: int | None = None,
    ) -> None:
        payload: dict[str, object] = {
            "type": event_type,
            "conversation_id": str(conversation_id),
            "message": jsonable_encoder(message),
        }

        if sequence_head is not None:
            payload["sequence_head"] = sequence_head

        async with self._lock:
            sockets = list(self._connections.get(conversation_id, set()))

        stale_sockets: list[WebSocket] = []

        for websocket in sockets:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale_sockets.append(websocket)

        for websocket in stale_sockets:
            await self.disconnect(conversation_id, websocket)

    async def close(self) -> None:
        async with self._lock:
            connections = {
                conversation_id: list(sockets)
                for conversation_id, sockets in self._connections.items()
            }
            self._connections.clear()

        for sockets in connections.values():
            for websocket in sockets:
                try:
                    await websocket.close()
                except Exception:
                    continue
