import { apiRequest } from "./client";

export type PresenceStatus = "online" | "afk" | "offline";

export type PresenceHeartbeatPayload = {
  tab_id: string;
  last_interaction_at: string;
};

export type PresenceHeartbeatResponse = {
  presence_status: PresenceStatus;
  checked_at: string;
};

export const presenceApi = {
  heartbeat(payload: PresenceHeartbeatPayload) {
    return apiRequest<PresenceHeartbeatResponse>("/api/presence/heartbeat", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
