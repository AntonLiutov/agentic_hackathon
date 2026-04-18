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
  is_admin: boolean;
  is_banned: boolean;
  can_join: boolean;
  can_leave: boolean;
  can_manage_members: boolean;
  joined_at: string | null;
};

export type RoomMember = {
  id: string;
  username: string;
  joined_at: string;
  is_owner: boolean;
  is_admin: boolean;
  can_remove: boolean;
};

export type RoomBan = {
  id: string;
  user_id: string;
  username: string;
  banned_at: string;
  banned_by_username: string | null;
  reason: string | null;
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

export type RoomMemberListResponse = {
  members: RoomMember[];
};

export type RoomBanListResponse = {
  bans: RoomBan[];
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
  listMembers: (roomId: string) =>
    apiRequest<RoomMemberListResponse>(`/api/rooms/${roomId}/members`),
  listBans: (roomId: string) =>
    apiRequest<RoomBanListResponse>(`/api/rooms/${roomId}/bans`),
  removeMember: (roomId: string, memberUserId: string) =>
    apiRequest<{ success: boolean; message: string }>(
      `/api/rooms/${roomId}/members/${memberUserId}`,
      {
        method: "DELETE",
      },
    ),
  acceptInvitation: (invitationId: string) =>
    apiRequest<RoomSummary>(`/api/rooms/invitations/${invitationId}/accept`, {
      method: "POST",
    }),
};
