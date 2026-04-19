import { apiRequest } from "./client";

export type BlockedUserSummary = {
  block_id: string;
  blocked_user_id: string;
  blocked_username: string;
  reason: string | null;
  blocked_at: string;
};

export type BlockedUserListResponse = {
  blocked_users: BlockedUserSummary[];
};

export type CreateUserBlockPayload = {
  username: string;
  reason?: string;
};

export const blocksApi = {
  listBlocks: () => apiRequest<BlockedUserListResponse>("/api/blocks"),
  blockUser: (payload: CreateUserBlockPayload) =>
    apiRequest<BlockedUserSummary>("/api/blocks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  unblockUser: (blockedUserId: string) =>
    apiRequest<{ success: boolean; message: string }>(`/api/blocks/${blockedUserId}`, {
      method: "DELETE",
    }),
};
