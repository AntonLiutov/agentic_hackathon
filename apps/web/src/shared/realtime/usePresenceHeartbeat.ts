import { useEffect, useRef } from "react";

import { presenceApi } from "../api/presence";

const HEARTBEAT_INTERVAL_MS = 15_000;
const TAB_STORAGE_KEY = "agentic-chat-tab-id";

function getTabId() {
  const existingTabId = window.sessionStorage.getItem(TAB_STORAGE_KEY);

  if (existingTabId) {
    return existingTabId;
  }

  const nextTabId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.sessionStorage.setItem(TAB_STORAGE_KEY, nextTabId);
  return nextTabId;
}

type UsePresenceHeartbeatOptions = {
  enabled: boolean;
  onHeartbeat?: (presenceStatus: "online" | "afk" | "offline") => void;
};

export function usePresenceHeartbeat({
  enabled,
  onHeartbeat,
}: UsePresenceHeartbeatOptions) {
  const lastInteractionAtRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const tabId = getTabId();

    function markInteraction() {
      lastInteractionAtRef.current = Date.now();
    }

    async function sendHeartbeat() {
      try {
        const response = await presenceApi.heartbeat({
          tab_id: tabId,
          last_interaction_at: new Date(lastInteractionAtRef.current).toISOString(),
        });
        onHeartbeat?.(response.presence_status);
      } catch {
        return;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        markInteraction();
      }
    }

    const intervalId = window.setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    window.addEventListener("pointermove", markInteraction);
    window.addEventListener("pointerdown", markInteraction);
    window.addEventListener("keydown", markInteraction);
    window.addEventListener("focus", markInteraction);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void sendHeartbeat();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("pointermove", markInteraction);
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("focus", markInteraction);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, onHeartbeat]);
}
