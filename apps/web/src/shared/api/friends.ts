import type { PresenceStatus } from "./presence";
import { apiRequest } from "./client";

export type FriendshipState =
  | "self"
  | "friend"
  | "incoming_request"
  | "outgoing_request"
  | "none";

export type FriendSummary = {
  friendship_id: string;
  user_id: string;
  username: string;
  friends_since: string;
  presence_status: PresenceStatus;
};

export type FriendRequestSummary = {
  id: string;
  requester_user_id: string;
  requester_username: string;
  recipient_user_id: string;
  recipient_username: string;
  request_text: string | null;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
};

export type FriendListResponse = {
  friends: FriendSummary[];
};

export type FriendRequestListResponse = {
  incoming_requests: FriendRequestSummary[];
  outgoing_requests: FriendRequestSummary[];
};

export type CreateFriendRequestPayload = {
  username: string;
  message?: string;
};

export const friendsApi = {
  listFriends: () => apiRequest<FriendListResponse>("/api/friends"),
  listRequests: () => apiRequest<FriendRequestListResponse>("/api/friends/requests"),
  sendRequest: (payload: CreateFriendRequestPayload) =>
    apiRequest<FriendRequestSummary>("/api/friends/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  acceptRequest: (requestId: string) =>
    apiRequest<FriendSummary>(`/api/friends/requests/${requestId}/accept`, {
      method: "POST",
    }),
  rejectRequest: (requestId: string) =>
    apiRequest<{ success: boolean; message: string }>(`/api/friends/requests/${requestId}/reject`, {
      method: "POST",
    }),
  removeFriend: (friendUserId: string) =>
    apiRequest<{ success: boolean; message: string }>(`/api/friends/${friendUserId}`, {
      method: "DELETE",
    }),
};
