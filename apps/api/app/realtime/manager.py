from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

from app.api.schemas.messages import ConversationMessageResponse


@dataclass(frozen=True)
class _SocketRegistration:
    user_id: UUID
    websocket: WebSocket


class RealtimeConnectionManager:
    def __init__(self) -> None:
        self._conversation_connections: dict[UUID, set[_SocketRegistration]] = defaultdict(set)
        self._user_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(
        self,
        conversation_id: UUID,
        user_id: UUID,
        websocket: WebSocket,
    ) -> None:
        await websocket.accept()

        async with self._lock:
            self._conversation_connections[conversation_id].add(
                _SocketRegistration(user_id=user_id, websocket=websocket)
            )

    async def disconnect(self, conversation_id: UUID, websocket: WebSocket) -> None:
        async with self._lock:
            connections = self._conversation_connections.get(conversation_id)

            if not connections:
                return

            stale_registration = next(
                (
                    registration
                    for registration in connections
                    if registration.websocket is websocket
                ),
                None,
            )

            if stale_registration is not None:
                connections.discard(stale_registration)

            if not connections:
                self._conversation_connections.pop(conversation_id, None)

    async def connect_inbox(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()

        async with self._lock:
            self._user_connections[user_id].add(websocket)

    async def disconnect_inbox(self, user_id: UUID, websocket: WebSocket) -> None:
        async with self._lock:
            connections = self._user_connections.get(user_id)

            if not connections:
                return

            connections.discard(websocket)

            if not connections:
                self._user_connections.pop(user_id, None)

    async def get_connected_conversation_user_ids(self, conversation_id: UUID) -> set[UUID]:
        async with self._lock:
            return {
                registration.user_id
                for registration in self._conversation_connections.get(conversation_id, set())
            }

    async def broadcast_message_event(
        self,
        *,
        conversation_id: UUID,
        event_type: str,
        messages_by_user_id: dict[UUID, ConversationMessageResponse],
        sequence_head: int | None = None,
    ) -> None:
        async with self._lock:
            registrations = list(self._conversation_connections.get(conversation_id, set()))

        stale_registrations: list[_SocketRegistration] = []

        for registration in registrations:
            message = messages_by_user_id.get(registration.user_id)

            if message is None:
                continue

            payload: dict[str, object] = {
                "type": event_type,
                "conversation_id": str(conversation_id),
                "message": jsonable_encoder(message),
            }

            if sequence_head is not None:
                payload["sequence_head"] = sequence_head

            try:
                await registration.websocket.send_json(payload)
            except Exception:
                stale_registrations.append(registration)

        for registration in stale_registrations:
            await self.disconnect(conversation_id, registration.websocket)

    async def broadcast_inbox_unread_event(
        self,
        *,
        user_ids: list[UUID],
        conversation_id: UUID,
        sequence_head: int,
    ) -> None:
        stale_sockets_by_user: dict[UUID, list[WebSocket]] = defaultdict(list)

        async with self._lock:
            connections_by_user = {
                user_id: list(self._user_connections.get(user_id, set()))
                for user_id in user_ids
            }

        payload = {
            "type": "conversation.unread",
            "conversation_id": str(conversation_id),
            "sequence_head": sequence_head,
        }

        for user_id, sockets in connections_by_user.items():
            for websocket in sockets:
                try:
                    await websocket.send_json(payload)
                except Exception:
                    stale_sockets_by_user[user_id].append(websocket)

        for user_id, sockets in stale_sockets_by_user.items():
            for websocket in sockets:
                await self.disconnect_inbox(user_id, websocket)

    async def broadcast_presence_event(
        self,
        *,
        user_ids: list[UUID],
        subject_user_id: UUID,
        presence_status: str,
    ) -> None:
        stale_sockets_by_user: dict[UUID, list[WebSocket]] = defaultdict(list)

        async with self._lock:
            connections_by_user = {
                user_id: list(self._user_connections.get(user_id, set()))
                for user_id in user_ids
            }

        payload = {
            "type": "presence.updated",
            "user_id": str(subject_user_id),
            "presence_status": presence_status,
        }

        for user_id, sockets in connections_by_user.items():
            for websocket in sockets:
                try:
                    await websocket.send_json(payload)
                except Exception:
                    stale_sockets_by_user[user_id].append(websocket)

        for user_id, sockets in stale_sockets_by_user.items():
            for websocket in sockets:
                await self.disconnect_inbox(user_id, websocket)

    async def close(self) -> None:
        async with self._lock:
            conversation_connections = {
                conversation_id: list(registrations)
                for conversation_id, registrations in self._conversation_connections.items()
            }
            user_connections = {
                user_id: list(sockets)
                for user_id, sockets in self._user_connections.items()
            }
            self._conversation_connections.clear()
            self._user_connections.clear()

        for registrations in conversation_connections.values():
            for registration in registrations:
                try:
                    await registration.websocket.close()
                except Exception:
                    continue

        for sockets in user_connections.values():
            for websocket in sockets:
                try:
                    await websocket.close()
                except Exception:
                    continue
