import { apiRequest } from "./client";

export type MessageReplyReference = {
  id: number;
  author_username: string;
  body_text: string | null;
  deleted_at: string | null;
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
};

export type ConversationMessageListResponse = {
  conversation_id: string;
  sequence_head: number;
  messages: ConversationMessage[];
};

export type CreateMessagePayload = {
  body_text: string;
  reply_to_message_id?: number;
};

export type EditMessagePayload = {
  body_text: string;
};

export const messagesApi = {
  list(conversationId: string, limit = 50) {
    return apiRequest<ConversationMessageListResponse>(
      `/api/conversations/${conversationId}/messages`,
      {
        query: { limit },
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
};
