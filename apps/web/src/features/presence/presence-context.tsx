import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { PresenceStatus } from "../../shared/api/presence";
import { useSession } from "../session/use-session";

type PresenceContextValue = {
  getPresence: (userId: string) => PresenceStatus | null;
  setPresence: (userId: string, status: PresenceStatus) => void;
  setMany: (entries: Array<{ userId: string; status: PresenceStatus }>) => void;
  clearPresence: () => void;
};

export const PresenceContext = createContext<PresenceContextValue | null>(null);

export function PresenceProvider({ children }: PropsWithChildren) {
  const { status } = useSession();
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceStatus>>({});

  useEffect(() => {
    if (status !== "authenticated") {
      setPresenceByUserId({});
    }
  }, [status]);

  const getPresence = useCallback(
    (userId: string) => presenceByUserId[userId] ?? null,
    [presenceByUserId],
  );

  const setPresence = useCallback((userId: string, status: PresenceStatus) => {
    setPresenceByUserId((currentPresenceByUserId) => ({
      ...currentPresenceByUserId,
      [userId]: status,
    }));
  }, []);

  const setMany = useCallback((entries: Array<{ userId: string; status: PresenceStatus }>) => {
    setPresenceByUserId((currentPresenceByUserId) => {
      const nextPresenceByUserId = { ...currentPresenceByUserId };

      for (const entry of entries) {
        nextPresenceByUserId[entry.userId] = entry.status;
      }

      return nextPresenceByUserId;
    });
  }, []);

  const clearPresence = useCallback(() => {
    setPresenceByUserId({});
  }, []);

  const value = useMemo(
    () => ({
      getPresence,
      setPresence,
      setMany,
      clearPresence,
    }),
    [clearPresence, getPresence, setMany, setPresence],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
