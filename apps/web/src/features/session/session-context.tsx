import {
  type PropsWithChildren,
  createContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type SessionUser = {
  name: string;
  email: string;
};

type SessionState = {
  status: "bootstrapping" | "anonymous" | "authenticated";
  user: SessionUser | null;
};

type SessionContextValue = SessionState & {
  signInPreview: () => void;
  signOut: () => void;
};

const previewSessionKey = "agentic-chat.preview-session";

export const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({
    status: "bootstrapping",
    user: null,
  });

  useEffect(() => {
    const raw = window.sessionStorage.getItem(previewSessionKey);

    if (raw) {
      setState({
        status: "authenticated",
        user: JSON.parse(raw) as SessionUser,
      });
      return;
    }

    setState({
      status: "anonymous",
      user: null,
    });
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      signInPreview: () => {
        const previewUser = {
          name: "Preview User",
          email: "preview@agentic.chat",
        };
        window.sessionStorage.setItem(previewSessionKey, JSON.stringify(previewUser));
        setState({
          status: "authenticated",
          user: previewUser,
        });
      },
      signOut: () => {
        window.sessionStorage.removeItem(previewSessionKey);
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
