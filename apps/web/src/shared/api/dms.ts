import { apiRequest } from "./client";

export type DirectMessage = {
  id: string;
  counterpart_user_id: string;
  counterpart_username: string;
  counterpart_email: string;
  status: "active" | "frozen";
  created_at: string;
  is_initiator: boolean;
  can_message: boolean;
};

export type DirectMessageListResponse = {
  direct_messages: DirectMessage[];
};

export type CreateDirectMessagePayload = {
  username: string;
};

export const dmsApi = {
  listMine() {
    return apiRequest<DirectMessageListResponse>("/api/dms/mine");
  },
  open(payload: CreateDirectMessagePayload) {
    return apiRequest<DirectMessage>("/api/dms", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getById(directMessageId: string) {
    return apiRequest<DirectMessage>(`/api/dms/${directMessageId}`);
  },
};
