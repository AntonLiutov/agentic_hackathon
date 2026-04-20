import {
  type PropsWithChildren,
  useCallback,
  createContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getApiErrorMessage } from "../../shared/api/client";
import {
  dmsApi,
  type CreateDirectMessagePayload,
  type DirectMessage,
} from "../../shared/api/dms";
import { useSession } from "../session/use-session";

type DirectMessagesContextValue = {
  directMessages: DirectMessage[];
  selectedDirectMessageId: string | null;
  selectedDirectMessage: DirectMessage | null;
  hasExplicitSelection: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  totalUnreadCount: number;
  selectDirectMessage: (directMessageId: string | null) => void;
  refreshDirectMessages: () => Promise<void>;
  openDirectMessage: (payload: CreateDirectMessagePayload) => Promise<DirectMessage>;
  upsertDirectMessage: (directMessage: DirectMessage) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  clearMessages: () => void;
};

export const DirectMessagesContext = createContext<DirectMessagesContextValue | null>(null);

function sortDirectMessages(directMessages: DirectMessage[]) {
  return [...directMessages].sort((left, right) =>
    left.counterpart_username.localeCompare(right.counterpart_username),
  );
}

function normalizeDirectMessage(directMessage: DirectMessage): DirectMessage {
  return {
    ...directMessage,
    unread_count: directMessage.unread_count ?? 0,
  };
}

export function DirectMessagesProvider({ children }: PropsWithChildren) {
  const { status } = useSession();
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [selectedDirectMessageId, setSelectedDirectMessageId] = useState<string | null>(null);
  const [hasExplicitSelection, setHasExplicitSelection] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  async function loadDirectMessages() {
    if (status !== "authenticated") {
      setDirectMessages([]);
      setSelectedDirectMessageId(null);
      setHasExplicitSelection(false);
      setIsLoading(false);
      setErrorMessage(null);
      setNoticeMessage(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await dmsApi.listMine();

      setDirectMessages(sortDirectMessages(response.direct_messages.map(normalizeDirectMessage)));
      setSelectedDirectMessageId((currentSelection) => {
        if (
          currentSelection &&
          response.direct_messages.some((directMessage) => directMessage.id === currentSelection)
        ) {
          setHasExplicitSelection(true);
          return currentSelection;
        }

        setHasExplicitSelection(false);
        return response.direct_messages[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to load direct messages right now."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function syncDirectMessages() {
      if (isCancelled) {
        return;
      }

      await loadDirectMessages();
    }

    void syncDirectMessages();

    return () => {
      isCancelled = true;
    };
  }, [status]);

  const selectedDirectMessage = useMemo(
    () =>
      directMessages.find((directMessage) => directMessage.id === selectedDirectMessageId) ?? null,
    [directMessages, selectedDirectMessageId],
  );

  const totalUnreadCount = useMemo(
    () =>
      directMessages.reduce(
        (totalUnread, directMessage) => totalUnread + directMessage.unread_count,
        0,
      ),
    [directMessages],
  );

  const selectDirectMessage = useCallback((directMessageId: string | null) => {
    setSelectedDirectMessageId(directMessageId);
    setHasExplicitSelection(directMessageId !== null);
    setErrorMessage(null);
    setNoticeMessage(null);
  }, []);

  const incrementUnread = useCallback((conversationId: string) => {
    setDirectMessages((currentDirectMessages) =>
      currentDirectMessages.map((directMessage) =>
        directMessage.id === conversationId
          ? {
              ...directMessage,
              unread_count: directMessage.unread_count + 1,
            }
          : directMessage,
      ),
    );
  }, []);

  const clearUnread = useCallback((conversationId: string) => {
    setDirectMessages((currentDirectMessages) =>
      currentDirectMessages.map((directMessage) =>
        directMessage.id === conversationId
          ? {
              ...directMessage,
              unread_count: 0,
            }
          : directMessage,
      ),
    );
  }, []);

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
    setNoticeMessage(null);
  }, []);

  const value = useMemo<DirectMessagesContextValue>(
    () => ({
      directMessages,
      selectedDirectMessageId,
      selectedDirectMessage,
      hasExplicitSelection,
      isLoading,
      errorMessage,
      noticeMessage,
      totalUnreadCount,
      selectDirectMessage,
      refreshDirectMessages: async () => {
        await loadDirectMessages();
      },
      openDirectMessage: async (payload) => {
        setErrorMessage(null);
        setNoticeMessage(null);
        const directMessage = normalizeDirectMessage(await dmsApi.open(payload));
        setDirectMessages((currentDirectMessages) => {
          const nextDirectMessages = currentDirectMessages.filter(
            (currentDirectMessage) => currentDirectMessage.id !== directMessage.id,
          );
          return sortDirectMessages([...nextDirectMessages, directMessage]);
        });
        setSelectedDirectMessageId(directMessage.id);
        setHasExplicitSelection(true);
        setNoticeMessage(`Direct message ready with ${directMessage.counterpart_username}.`);
        return directMessage;
      },
      upsertDirectMessage: (directMessage) => {
        const normalizedDirectMessage = normalizeDirectMessage(directMessage);
        setDirectMessages((currentDirectMessages) => {
          const nextDirectMessages = currentDirectMessages.filter(
            (currentDirectMessage) => currentDirectMessage.id !== normalizedDirectMessage.id,
          );
          return sortDirectMessages([...nextDirectMessages, normalizedDirectMessage]);
        });
      },
      incrementUnread,
      clearUnread,
      clearMessages,
    }),
    [
      clearMessages,
      clearUnread,
      directMessages,
      errorMessage,
      hasExplicitSelection,
      incrementUnread,
      isLoading,
      noticeMessage,
      selectDirectMessage,
      selectedDirectMessage,
      selectedDirectMessageId,
      totalUnreadCount,
    ],
  );

  return (
    <DirectMessagesContext.Provider value={value}>
      {children}
    </DirectMessagesContext.Provider>
  );
}
