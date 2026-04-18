import { apiRequest } from "./client";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
};

export type AuthSessionResponse = {
  user: AuthUser;
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
};
