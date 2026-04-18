import { apiRequest } from "./client";

export type RoomVisibility = "public" | "private";

export type RoomSummary = {
  id: string;
  name: string;
  description: string | null;
  visibility: RoomVisibility;
  owner_user_id: string;
  member_count: number;
  is_member: boolean;
  is_owner: boolean;
  is_banned: boolean;
  can_join: boolean;
  can_leave: boolean;
  joined_at: string | null;
};

export type RoomInvitation = {
  id: string;
  room_conversation_id: string;
  room_name: string;
  room_description: string | null;
  inviter_username: string | null;
  status: "pending" | "accepted" | "declined" | "revoked";
  created_at: string;
};

export type RoomListResponse = {
  rooms: RoomSummary[];
};

export type RoomInvitationListResponse = {
  invitations: RoomInvitation[];
};

export type CreateRoomPayload = {
  name: string;
  description?: string;
  visibility: RoomVisibility;
};

export type CreateInvitationPayload = {
  username: string;
  message?: string;
};

export const roomsApi = {
  listMine: () => apiRequest<RoomListResponse>("/api/rooms/mine"),
  listPublic: (search?: string) =>
    apiRequest<RoomListResponse>("/api/rooms/public", {
      query: search ? { search } : undefined,
    }),
  create: (payload: CreateRoomPayload) =>
    apiRequest<RoomSummary>("/api/rooms", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  join: (roomId: string) =>
    apiRequest<RoomSummary>(`/api/rooms/${roomId}/join`, {
      method: "POST",
    }),
  leave: (roomId: string) =>
    apiRequest<{ success: boolean; message: string }>(`/api/rooms/${roomId}/leave`, {
      method: "POST",
    }),
  listInvitations: () => apiRequest<RoomInvitationListResponse>("/api/rooms/invitations/mine"),
  invite: (roomId: string, payload: CreateInvitationPayload) =>
    apiRequest<RoomInvitation>(`/api/rooms/${roomId}/invitations`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  acceptInvitation: (invitationId: string) =>
    apiRequest<RoomSummary>(`/api/rooms/invitations/${invitationId}/accept`, {
      method: "POST",
    }),
};
