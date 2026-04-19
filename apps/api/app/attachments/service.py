from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models.message import Attachment, Message, MessageAttachment

IMAGE_MAX_BYTES = 3 * 1024 * 1024
FILE_MAX_BYTES = 20 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024


@dataclass
class StoredAttachmentInput:
    storage_key: str
    original_filename: str
    media_type: str | None
    size_bytes: int
    comment_text: str | None


def ensure_attachments_dir(path: str) -> None:
    Path(path).mkdir(parents=True, exist_ok=True)


def _normalize_filename(filename: str | None) -> str:
    normalized = Path(filename or "attachment.bin").name.strip()
    return normalized or "attachment.bin"


def _get_size_limit(media_type: str | None) -> int:
    if media_type and media_type.startswith("image/"):
        return IMAGE_MAX_BYTES
    return FILE_MAX_BYTES


def _get_size_limit_message(media_type: str | None) -> str:
    if media_type and media_type.startswith("image/"):
        return "Images must be 3 MB or smaller."
    return "Files must be 20 MB or smaller."


async def persist_upload(
    upload: UploadFile,
    *,
    settings: Settings,
    comment_text: str | None,
) -> StoredAttachmentInput:
    ensure_attachments_dir(settings.attachments_dir)

    original_filename = _normalize_filename(upload.filename)
    media_type = upload.content_type
    size_limit = _get_size_limit(media_type)
    storage_key = f"{uuid.uuid4().hex}-{original_filename}"
    destination = Path(settings.attachments_dir) / storage_key

    total_size = 0

    try:
        with destination.open("wb") as target:
            while True:
                chunk = await upload.read(READ_CHUNK_BYTES)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > size_limit:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=_get_size_limit_message(media_type),
                    )
                target.write(chunk)
    except HTTPException:
        if destination.exists():
            destination.unlink(missing_ok=True)
        raise
    except OSError as error:
        if destination.exists():
            destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to store the uploaded attachment right now.",
        ) from error
    finally:
        await upload.close()

    if total_size <= 0:
        if destination.exists():
            destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded attachments cannot be empty.",
        )

    return StoredAttachmentInput(
        storage_key=storage_key,
        original_filename=original_filename,
        media_type=media_type,
        size_bytes=total_size,
        comment_text=comment_text,
    )


def get_attachment_path(*, settings: Settings, storage_key: str) -> Path:
    return Path(settings.attachments_dir) / storage_key


def delete_attachment_file(*, settings: Settings, storage_key: str) -> None:
    path = get_attachment_path(settings=settings, storage_key=storage_key)
    if path.exists():
        path.unlink(missing_ok=True)


def delete_attachment_files(*, settings: Settings, storage_keys: Sequence[str]) -> None:
    for storage_key in storage_keys:
        delete_attachment_file(settings=settings, storage_key=storage_key)


async def list_attachment_storage_keys_for_conversations(
    db: AsyncSession,
    *,
    conversation_ids: Sequence[UUID],
) -> list[str]:
    if not conversation_ids:
        return []

    query = (
        select(Attachment.storage_key)
        .join(MessageAttachment, MessageAttachment.attachment_id == Attachment.id)
        .join(Message, Message.id == MessageAttachment.message_id)
        .where(Message.conversation_id.in_(conversation_ids))
        .distinct()
    )
    return list((await db.execute(query)).scalars().all())
