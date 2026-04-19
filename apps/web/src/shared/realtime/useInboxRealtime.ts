import { useEffect, useRef, useState } from "react";

import type { PresenceStatus } from "../api/presence";
import { env } from "../config/env";

type InboxRealtimeStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline";

type UseInboxRealtimeOptions = {
  enabled: boolean;
  onUnread: (conversationId: string, sequenceHead: number) => void;
  onPresence?: (userId: string, presenceStatus: PresenceStatus) => void;
  onFriendshipsChanged?: () => void;
  onConnected?: () => void;
};

type InboxEnvelope =
  | {
      type: "inbox.subscribed";
    }
  | {
      type: "conversation.unread";
      conversation_id: string;
      sequence_head: number;
    }
  | {
      type: "presence.updated";
      user_id: string;
      presence_status: PresenceStatus;
    }
  | {
      type: "friendships.updated";
    }
  | {
      type: "pong";
    };

export function useInboxRealtime({
  enabled,
  onUnread,
  onPresence,
  onFriendshipsChanged,
  onConnected,
}: UseInboxRealtimeOptions) {
  const [status, setStatus] = useState<InboxRealtimeStatus>("idle");
  const reconnectTimeoutRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const handlersRef = useRef({
    onUnread,
    onPresence,
    onFriendshipsChanged,
    onConnected,
  });

  useEffect(() => {
    handlersRef.current = {
      onUnread,
      onPresence,
      onFriendshipsChanged,
      onConnected,
    };
  }, [onConnected, onFriendshipsChanged, onPresence, onUnread]);

  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") {
      setStatus("idle");
      return;
    }

    let cancelled = false;

    function clearReconnectTimer() {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }

    function connect() {
      if (cancelled) {
        return;
      }

      setStatus(reconnectAttemptRef.current === 0 ? "connecting" : "reconnecting");
      const socket = new WebSocket(`${env.webSocketBaseUrl}/ws/inbox`);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus("live");
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as InboxEnvelope;

        if (payload.type === "inbox.subscribed") {
          handlersRef.current.onConnected?.();
          return;
        }

        if (payload.type === "conversation.unread") {
          handlersRef.current.onUnread(payload.conversation_id, payload.sequence_head);
          return;
        }

        if (payload.type === "presence.updated") {
          handlersRef.current.onPresence?.(payload.user_id, payload.presence_status);
          return;
        }

        if (payload.type === "friendships.updated") {
          handlersRef.current.onFriendshipsChanged?.();
        }
      };

      socket.onerror = () => {
        setStatus("reconnecting");
      };

      socket.onclose = () => {
        socketRef.current = null;

        if (cancelled) {
          setStatus("offline");
          return;
        }

        reconnectAttemptRef.current += 1;
        setStatus("reconnecting");
        clearReconnectTimer();
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, Math.min(3000, reconnectAttemptRef.current * 750));
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      setStatus("idle");
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled]);

  return {
    status,
  };
}
