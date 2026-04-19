from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

MessageBody = Annotated[
    str,
    StringConstraints(
        min_length=1,
        max_length=3072,
    ),
]


class MessageReplyReferenceResponse(BaseModel):
    id: int
    author_username: str
    body_text: str | None
    deleted_at: datetime | None


class MessageAttachmentResponse(BaseModel):
    id: UUID
    original_filename: str
    media_type: str | None
    size_bytes: int
    comment_text: str | None
    content_path: str
    download_path: str
    is_image: bool


class ConversationMessageResponse(BaseModel):
    id: int
    conversation_id: UUID
    author_user_id: UUID | None
    author_username: str
    sequence_number: int
    body_text: str | None
    reply_to_message_id: int | None
    reply_to_message: MessageReplyReferenceResponse | None
    created_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None
    is_edited: bool
    is_deleted: bool
    can_edit: bool
    can_delete: bool
    attachments: list[MessageAttachmentResponse]


class ConversationMessageListResponse(BaseModel):
    conversation_id: UUID
    sequence_head: int
    oldest_loaded_sequence: int | None
    newest_loaded_sequence: int | None
    next_before_sequence: int | None
    has_older: bool
    messages: list[ConversationMessageResponse]


class ConversationReadResponse(BaseModel):
    conversation_id: UUID
    last_read_sequence_number: int
    unread_count: int


class CreateMessageRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "body_text": "Hello team,\nthis is the first real persisted message.",
                "reply_to_message_id": 12,
            }
        }
    )

    body_text: MessageBody
    reply_to_message_id: int | None = None


class EditMessageRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "body_text": "Edited message body with clarified details.",
            }
        }
    )

    body_text: MessageBody
