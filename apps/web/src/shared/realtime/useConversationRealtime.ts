import { useEffect, useRef, useState } from "react";

import { env } from "../config/env";
import type { ConversationMessage } from "../api/messages";

type RealtimeStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline";

type UseConversationRealtimeOptions = {
  conversationId: string | null;
  enabled: boolean;
  onMessageCreated: (message: ConversationMessage, sequenceHead: number | null) => void;
  onMessageUpdated: (message: ConversationMessage) => void;
  onMessageDeleted: (message: ConversationMessage) => void;
};

type RealtimeEnvelope =
  | {
      type: "conversation.subscribed";
      conversation_id: string;
      sequence_head: number;
    }
  | {
      type: "message.created";
      conversation_id: string;
      sequence_head?: number;
      message: ConversationMessage;
    }
  | {
      type: "message.updated" | "message.deleted";
      conversation_id: string;
      message: ConversationMessage;
    }
  | {
      type: "pong";
    };

export function useConversationRealtime({
  conversationId,
  enabled,
  onMessageCreated,
  onMessageUpdated,
  onMessageDeleted,
}: UseConversationRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const reconnectTimeoutRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    if (!enabled || !conversationId || typeof WebSocket === "undefined") {
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
      const socket = new WebSocket(
        `${env.webSocketBaseUrl}/ws/conversations/${conversationId}`,
      );
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus("live");
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as RealtimeEnvelope;

        if (payload.type === "message.created") {
          onMessageCreated(payload.message, payload.sequence_head ?? null);
          return;
        }

        if (payload.type === "message.updated") {
          onMessageUpdated(payload.message);
          return;
        }

        if (payload.type === "message.deleted") {
          onMessageDeleted(payload.message);
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
  }, [
    conversationId,
    enabled,
    onMessageCreated,
    onMessageDeleted,
    onMessageUpdated,
  ]);

  return {
    status,
  };
}
