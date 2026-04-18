import { type PropsWithChildren, createContext, useEffect, useMemo, useState } from "react";

import { authApi, type LoginPayload, type RegisterPayload } from "../../shared/api/auth";
import { ApiError } from "../../shared/api/client";

type SessionUser = {
  id: string;
  username: string;
  name: string;
  email: string;
};

type SessionState = {
  status: "bootstrapping" | "anonymous" | "authenticated";
  user: SessionUser | null;
};

type SessionContextValue = SessionState & {
  signIn: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
  clearSession: () => void;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

function mapSessionUser(user: { id: string; username: string; email: string }): SessionUser {
  return {
    id: user.id,
    username: user.username,
    name: user.username,
    email: user.email,
  };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({
    status: "bootstrapping",
    user: null,
  });

  useEffect(() => {
    let isCancelled = false;

    async function bootstrapSession() {
      try {
        const payload = await authApi.me();

        if (isCancelled) {
          return;
        }

        setState({
          status: "authenticated",
          user: mapSessionUser(payload.user),
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && error.status !== 401) {
          console.error("Session bootstrap failed.", error);
        }

        setState({
          status: "anonymous",
          user: null,
        });
      }
    }

    void bootstrapSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      signIn: async (payload) => {
        const response = await authApi.signIn(payload);
        setState({
          status: "authenticated",
          user: mapSessionUser(response.user),
        });
      },
      register: async (payload) => {
        const response = await authApi.register(payload);
        setState({
          status: "authenticated",
          user: mapSessionUser(response.user),
        });
      },
      refreshSession: async () => {
        const response = await authApi.me();
        setState({
          status: "authenticated",
          user: mapSessionUser(response.user),
        });
      },
      signOut: async () => {
        try {
          await authApi.signOut();
        } finally {
          setState({
            status: "anonymous",
            user: null,
          });
        }
      },
      clearSession: () => {
        setState({
          status: "anonymous",
          user: null,
        });
      },
    }),
    [state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
