from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session, get_settings_from_request
from app.auth.service import get_auth_context
from app.core.config import Settings
from app.db.models.message import Attachment, Message, MessageAttachment
from app.messages.service import get_conversation_access_context

router = APIRouter(tags=["attachments"])


@router.get(
    "/api/attachments/{attachment_id}",
    response_class=FileResponse,
    summary="Read or download an attachment",
    description=(
        "Streams an attachment through the backend after checking the current user's "
        "conversation access."
    ),
)
async def get_attachment_content(
    attachment_id: UUID,
    request: Request,
    download: bool = Query(default=False),
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings_from_request),
) -> FileResponse:
    auth_context = await get_auth_context(
        db,
        settings=settings,
        session_token=request.cookies.get(settings.session_cookie_name),
        touch_session=False,
        required=True,
    )

    row = (
        await db.execute(
            select(Attachment, Message.conversation_id)
            .join(MessageAttachment, MessageAttachment.attachment_id == Attachment.id)
            .join(Message, Message.id == MessageAttachment.message_id)
            .where(Attachment.id == attachment_id)
            .limit(1)
        )
    ).first()

    if row is None:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        )

    attachment, conversation_id = row
    await get_conversation_access_context(
        db,
        conversation_id=conversation_id,
        user=auth_context.user,
    )

    file_path = Path(settings.attachments_dir) / attachment.storage_key
    if not file_path.exists():
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment file not found.",
        )

    return FileResponse(
        path=file_path,
        media_type=attachment.media_type or "application/octet-stream",
        filename=attachment.original_filename,
        content_disposition_type="attachment" if download else "inline",
    )
