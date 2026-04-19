import { apiRequest } from "./client";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
};

export type AuthSessionResponse = {
  user: AuthUser;
};

export type ActionResponse = {
  success: boolean;
  message: string;
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

export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
};

export type DeleteAccountPayload = {
  current_password: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  token: string;
  new_password: string;
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
  changePassword: (payload: ChangePasswordPayload) =>
    apiRequest<ActionResponse>("/api/auth/password/change", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteAccount: (payload: DeleteAccountPayload) =>
    apiRequest<ActionResponse>("/api/auth/account", {
      method: "DELETE",
      body: JSON.stringify(payload),
    }),
  requestPasswordReset: (payload: ForgotPasswordPayload) =>
    apiRequest<ActionResponse>("/api/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  validateResetToken: (token: string) =>
    apiRequest<{ valid: boolean }>(`/api/auth/password/reset/${encodeURIComponent(token)}`),
  resetPassword: (payload: ResetPasswordPayload) =>
    apiRequest<ActionResponse>("/api/auth/password/reset", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listSessions: () => apiRequest<ActiveSessionsResponse>("/api/auth/sessions"),
  revokeSession: (sessionId: string) =>
    apiRequest<{ success: boolean }>(`/api/auth/sessions/${sessionId}`, {
      method: "DELETE",
    }),
};
