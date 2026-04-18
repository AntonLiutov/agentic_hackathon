from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from app.auth.service import get_auth_context
from app.messages.service import get_conversation_access_context

router = APIRouter()


@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_websocket(websocket: WebSocket, conversation_id: UUID) -> None:
    settings = websocket.app.state.settings
    session_factory = websocket.app.state.database.session_factory
    realtime_manager = websocket.app.state.realtime

    async with session_factory() as db:  # type: AsyncSession
        auth_context = await get_auth_context(
            db,
            settings=settings,
            session_token=websocket.cookies.get(settings.session_cookie_name),
            touch_session=True,
            required=False,
        )

        if auth_context is None:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Authentication required.",
            )
            return

        try:
            access_context = await get_conversation_access_context(
                db,
                conversation_id=conversation_id,
                user=auth_context.user,
            )
        except HTTPException:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Conversation access denied.",
            )
            return

    await realtime_manager.connect(conversation_id, websocket)
    await websocket.send_json(
        {
            "type": "conversation.subscribed",
            "conversation_id": str(conversation_id),
            "sequence_head": access_context.conversation.message_sequence_head,
        }
    )

    try:
        while True:
            payload = await websocket.receive_json()

            if payload.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await realtime_manager.disconnect(conversation_id, websocket)
