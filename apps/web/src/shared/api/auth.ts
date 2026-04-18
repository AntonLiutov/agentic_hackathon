import { apiRequest } from "./client";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
};

export type AuthSessionResponse = {
  user: AuthUser;
};

export type ActiveSession = {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  is_current: boolean;
};

export type ActiveSessionsResponse = {
  sessions: ActiveSession[];
};

export type RegisterPayload = {
  email: string;
  username: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export const authApi = {
  me: () => apiRequest<AuthSessionResponse>("/api/auth/me"),
  register: (payload: RegisterPayload) =>
    apiRequest<AuthSessionResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  signIn: (payload: LoginPayload) =>
    apiRequest<AuthSessionResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  signOut: () =>
    apiRequest<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
    }),
  listSessions: () => apiRequest<ActiveSessionsResponse>("/api/auth/sessions"),
  revokeSession: (sessionId: string) =>
    apiRequest<{ success: boolean }>(`/api/auth/sessions/${sessionId}`, {
      method: "DELETE",
    }),
};
