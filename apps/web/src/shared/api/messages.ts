import { apiRequest, buildApiUrl } from "./client";

export type MessageReplyReference = {
  id: number;
  author_username: string;
  body_text: string | null;
  deleted_at: string | null;
};

export type MessageAttachment = {
  id: string;
  original_filename: string;
  media_type: string | null;
  size_bytes: number;
  comment_text: string | null;
  content_path: string;
  download_path: string;
  is_image: boolean;
};

export type ConversationMessage = {
  id: number;
  conversation_id: string;
  author_user_id: string | null;
  author_username: string;
  sequence_number: number;
  body_text: string | null;
  reply_to_message_id: number | null;
  reply_to_message: MessageReplyReference | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  can_edit: boolean;
  can_delete: boolean;
  attachments: MessageAttachment[];
};

export type ConversationMessageListResponse = {
  conversation_id: string;
  sequence_head: number;
  oldest_loaded_sequence: number | null;
  newest_loaded_sequence: number | null;
  next_before_sequence: number | null;
  has_older: boolean;
  messages: ConversationMessage[];
};

export type ConversationReadResponse = {
  conversation_id: string;
  last_read_sequence_number: number;
  unread_count: number;
};

export type CreateMessagePayload = {
  body_text: string;
  reply_to_message_id?: number;
};

export type CreateAttachmentMessagePayload = {
  body_text?: string;
  reply_to_message_id?: number;
  attachment_comment?: string;
  files: File[];
};

export type EditMessagePayload = {
  body_text: string;
};

export function getAttachmentAssetUrl(path: string) {
  return buildApiUrl(path);
}

export const messagesApi = {
  list(conversationId: string, limit = 50, beforeSequence?: number) {
    return apiRequest<ConversationMessageListResponse>(
      `/api/conversations/${conversationId}/messages`,
      {
        query: { limit, before_sequence: beforeSequence },
      },
    );
  },
  create(conversationId: string, payload: CreateMessagePayload) {
    return apiRequest<ConversationMessage>(
      `/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
  createWithAttachments(conversationId: string, payload: CreateAttachmentMessagePayload) {
    const formData = new FormData();

    if (payload.body_text !== undefined) {
      formData.append("body_text", payload.body_text);
    }

    if (payload.reply_to_message_id !== undefined) {
      formData.append("reply_to_message_id", String(payload.reply_to_message_id));
    }

    if (payload.attachment_comment !== undefined) {
      formData.append("attachment_comment", payload.attachment_comment);
    }

    for (const file of payload.files) {
      formData.append("files", file);
    }

    return apiRequest<ConversationMessage>(
      `/api/conversations/${conversationId}/messages/attachments`,
      {
        method: "POST",
        body: formData,
      },
    );
  },
  edit(messageId: number, payload: EditMessagePayload) {
    return apiRequest<ConversationMessage>(`/api/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  delete(messageId: number) {
    return apiRequest<ConversationMessage>(`/api/messages/${messageId}`, {
      method: "DELETE",
    });
  },
  markRead(conversationId: string) {
    return apiRequest<ConversationReadResponse>(`/api/conversations/${conversationId}/read`, {
      method: "POST",
    });
  },
};
