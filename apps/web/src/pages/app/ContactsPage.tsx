import {
  type ReactNode,
  useCallback,
  type FormEvent,
  type UIEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getApiErrorMessage } from "../../shared/api/client";
import { dmsApi, type DirectMessage } from "../../shared/api/dms";
import {
  messagesApi,
  type ConversationMessage,
} from "../../shared/api/messages";
import { useWorkspaceContextPanel } from "../../features/layout/workspace-context-panel";
import { useConversationRealtime } from "../../shared/realtime/useConversationRealtime";

function sortDirectMessages(directMessages: DirectMessage[]) {
  return [...directMessages].sort((left, right) =>
    left.counterpart_username.localeCompare(right.counterpart_username),
  );
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getReplyPreview(message: ConversationMessage) {
  if (!message.reply_to_message) {
    return null;
  }

  if (message.reply_to_message.deleted_at) {
    return `${message.reply_to_message.author_username}: Message deleted`;
  }

  return `${message.reply_to_message.author_username}: ${message.reply_to_message.body_text ?? ""}`;
}

const MESSAGE_PAGE_SIZE = 30;

function upsertConversationMessage(
  currentMessages: ConversationMessage[],
  nextMessage: ConversationMessage,
) {
  const mergedMessages = [
    ...currentMessages.filter((message) => message.id !== nextMessage.id),
    nextMessage,
  ];
  mergedMessages.sort((left, right) => left.sequence_number - right.sequence_number);
  return mergedMessages;
}

export function ContactsPage() {
  const { setPanelContent } = useWorkspaceContextPanel();
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [selectedDirectMessageId, setSelectedDirectMessageId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [composeText, setComposeText] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sequenceHead, setSequenceHead] = useState(0);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [replyTarget, setReplyTarget] = useState<ConversationMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [updatingMessageId, setUpdatingMessageId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{ previousHeight: number; previousTop: number } | null>(
    null,
  );

  const loadLatestMessages = useCallback(async (conversationId: string) => {
    const response = await messagesApi.list(conversationId, MESSAGE_PAGE_SIZE);
    setMessages(response.messages);
    setSequenceHead(response.sequence_head);
    setHasOlderMessages(response.has_older);
    setNextBeforeSequence(response.next_before_sequence);
    return response;
  }, []);

  function isNearBottom() {
    const container = messageListRef.current;

    if (!container) {
      return true;
    }

    return container.scrollHeight - (container.scrollTop + container.clientHeight) < 96;
  }

  useLayoutEffect(() => {
    const container = messageListRef.current;

    if (!container) {
      return;
    }

    if (pendingScrollRestoreRef.current) {
      const { previousHeight, previousTop } = pendingScrollRestoreRef.current;
      container.scrollTop = container.scrollHeight - previousHeight + previousTop;
      pendingScrollRestoreRef.current = null;
      return;
    }

    if (shouldAutoScrollRef.current) {
      container.scrollTop = container.scrollHeight;
      shouldAutoScrollRef.current = false;
    }
  }, [messages]);

  useEffect(() => {
    let isCancelled = false;

    async function loadDirectMessages() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await dmsApi.listMine();

        if (isCancelled) {
          return;
        }

        setDirectMessages(sortDirectMessages(response.direct_messages));
        setSelectedDirectMessageId((currentSelection) => {
          if (
            currentSelection &&
            response.direct_messages.some(
              (directMessage: DirectMessage) => directMessage.id === currentSelection,
            )
          ) {
            return currentSelection;
          }

          return response.direct_messages[0]?.id ?? null;
        });
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(getApiErrorMessage(error, "Unable to load direct messages right now."));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDirectMessages();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadMessages() {
      if (!selectedDirectMessageId) {
        setMessages([]);
        setSequenceHead(0);
        setHasOlderMessages(false);
        setNextBeforeSequence(null);
        setReplyTarget(null);
        setEditingMessageId(null);
        setComposeText("");
        setIsLoadingMessages(false);
        return;
      }

      setIsLoadingMessages(true);
      setErrorMessage(null);
      shouldAutoScrollRef.current = true;

      try {
        await loadLatestMessages(selectedDirectMessageId);

        if (isCancelled) {
          return;
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(getApiErrorMessage(error, "Unable to load direct messages right now."));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingMessages(false);
        }
      }
    }

    void loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [loadLatestMessages, selectedDirectMessageId]);

  async function loadOlderMessages() {
    if (!selectedDirectMessageId || !nextBeforeSequence || isLoadingOlderMessages) {
      return;
    }

    const container = messageListRef.current;
    if (container) {
      pendingScrollRestoreRef.current = {
        previousHeight: container.scrollHeight,
        previousTop: container.scrollTop,
      };
    }

    setIsLoadingOlderMessages(true);

    try {
      const response = await messagesApi.list(
        selectedDirectMessageId,
        MESSAGE_PAGE_SIZE,
        nextBeforeSequence,
      );
      setMessages((currentMessages) => {
        const knownMessageIds = new Set(currentMessages.map((message) => message.id));
        const olderMessages = response.messages.filter((message) => !knownMessageIds.has(message.id));
        return [...olderMessages, ...currentMessages];
      });
      setSequenceHead(response.sequence_head);
      setHasOlderMessages(response.has_older);
      setNextBeforeSequence(response.next_before_sequence);
    } catch (error) {
      pendingScrollRestoreRef.current = null;
      setErrorMessage(getApiErrorMessage(error, "Unable to load older messages right now."));
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }

  function handleMessageListScroll(event: UIEvent<HTMLDivElement>) {
    if (!hasOlderMessages || isLoadingOlderMessages) {
      return;
    }

    if (event.currentTarget.scrollTop <= 80) {
      void loadOlderMessages();
    }
  }

  const handleOpenDirectMessage = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsSubmitting(true);

    try {
      const directMessage = await dmsApi.open({ username });
      setDirectMessages((currentDirectMessages) => {
        const nextDirectMessages = currentDirectMessages.filter(
          (currentDirectMessage) => currentDirectMessage.id !== directMessage.id,
        );
        return sortDirectMessages([...nextDirectMessages, directMessage]);
      });
      setSelectedDirectMessageId(directMessage.id);
      setUsername("");
      setNoticeMessage(`Direct message ready with ${directMessage.counterpart_username}.`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to open that direct message right now."));
    } finally {
      setIsSubmitting(false);
    }
  }, [username]);

  function resetComposerState() {
    setComposeText("");
    setReplyTarget(null);
    setEditingMessageId(null);
  }

  async function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDirectMessage || !composeText.trim()) {
      return;
    }

    setErrorMessage(null);
    setNoticeMessage(null);
    setIsSubmittingMessage(true);

    try {
      if (editingMessageId !== null) {
        const updatedMessage = await messagesApi.edit(editingMessageId, {
          body_text: composeText,
        });
        setMessages((currentMessages) =>
          upsertConversationMessage(currentMessages, updatedMessage),
        );
        setNoticeMessage("Message updated.");
      } else {
        shouldAutoScrollRef.current = isNearBottom();
        const createdMessage = await messagesApi.create(selectedDirectMessage.id, {
          body_text: composeText,
          reply_to_message_id: replyTarget?.id,
        });
        setMessages((currentMessages) =>
          upsertConversationMessage(currentMessages, createdMessage),
        );
        setSequenceHead((currentSequenceHead) =>
          Math.max(currentSequenceHead, createdMessage.sequence_number),
        );
      }

      resetComposerState();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to save that message right now."));
    } finally {
      setIsSubmittingMessage(false);
    }
  }

  function handleReply(message: ConversationMessage) {
    setEditingMessageId(null);
    setReplyTarget(message);
    setComposeText("");
    setErrorMessage(null);
    setNoticeMessage(null);
  }

  function handleEdit(message: ConversationMessage) {
    setReplyTarget(null);
    setEditingMessageId(message.id);
    setComposeText(message.body_text ?? "");
    setErrorMessage(null);
    setNoticeMessage(null);
  }

  async function handleDelete(message: ConversationMessage) {
    setErrorMessage(null);
    setNoticeMessage(null);
    setUpdatingMessageId(message.id);

    try {
      const deletedMessage = await messagesApi.delete(message.id);
      setMessages((currentMessages) =>
        upsertConversationMessage(currentMessages, deletedMessage),
      );

      if (editingMessageId === message.id || replyTarget?.id === message.id) {
        resetComposerState();
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to delete that message right now."));
    } finally {
      setUpdatingMessageId(null);
    }
  }

  const selectedDirectMessage = useMemo(
    () =>
      directMessages.find((directMessage) => directMessage.id === selectedDirectMessageId) ?? null,
    [directMessages, selectedDirectMessageId],
  );

  const realtime = useConversationRealtime({
    conversationId: selectedDirectMessageId,
    enabled: selectedDirectMessageId !== null,
    onMessageCreated: useCallback(
      (message, liveSequenceHead) => {
        shouldAutoScrollRef.current = isNearBottom();

        setMessages((currentMessages) => {
          const newestLoadedSequence =
            currentMessages[currentMessages.length - 1]?.sequence_number ?? 0;

          if (
            newestLoadedSequence > 0 &&
            message.sequence_number > newestLoadedSequence + 1 &&
            selectedDirectMessageId
          ) {
            shouldAutoScrollRef.current = false;
            void loadLatestMessages(selectedDirectMessageId);
            return currentMessages;
          }

          return upsertConversationMessage(currentMessages, message);
        });
        setSequenceHead((currentSequenceHead) =>
          Math.max(currentSequenceHead, liveSequenceHead ?? message.sequence_number),
        );
      },
      [loadLatestMessages, selectedDirectMessageId],
    ),
    onMessageUpdated: useCallback((message) => {
      setMessages((currentMessages) => {
        if (!currentMessages.some((currentMessage) => currentMessage.id === message.id)) {
          return currentMessages;
        }

        return upsertConversationMessage(currentMessages, message);
      });
    }, []),
    onMessageDeleted: useCallback((message) => {
      setMessages((currentMessages) => {
        if (!currentMessages.some((currentMessage) => currentMessage.id === message.id)) {
          return currentMessages;
        }

        return upsertConversationMessage(currentMessages, message);
      });
    }, []),
  });

  const contactsPanelContent = useMemo<ReactNode>(
    () => (
      <>
        <h3>Direct messages</h3>
        <p>
          One-to-one conversations live on the shared conversation model, including persisted
          history, replies, edits, deletes, and continuity sequence numbers.
        </p>

        <div className="context-block">
          <strong>Start conversation</strong>
          <form className="auth-form" onSubmit={handleOpenDirectMessage}>
            <label>
              <span>Username</span>
              <input
                type="text"
                placeholder="alice"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                minLength={3}
                maxLength={64}
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Opening..." : "Open direct message"}
            </button>
          </form>
        </div>
      </>
    ),
    [handleOpenDirectMessage, isSubmitting, username],
  );

  useEffect(() => {
    setPanelContent(contactsPanelContent);

    return () => {
      setPanelContent(null);
    };
  }, [contactsPanelContent, setPanelContent]);

  return (
    <section className="chat-workspace card">
      {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
      {noticeMessage ? <p className="auth-success">{noticeMessage}</p> : null}

      <div className="chat-room-layout chat-room-layout--narrow-rail">
        <div className="chat-room-main">
          {selectedDirectMessage ? (
            <>
              <header className="chat-header room-header">
                <div>
                  <p className="eyebrow">Conversation</p>
                  <h2>{selectedDirectMessage.counterpart_username}</h2>
                  <p>Direct conversation on the shared chat model.</p>
                </div>

                <div className="room-header-actions">
                  <span className="status-pill status-pill--neutral">direct message</span>
                  <span className="status-pill status-pill--neutral">
                    {selectedDirectMessage.status}
                  </span>
                  <span className="status-pill status-pill--neutral">sequence {sequenceHead}</span>
                  <span
                    className={
                      realtime.status === "live"
                        ? "status-pill status-pill--success"
                        : "status-pill status-pill--warning"
                    }
                  >
                    {realtime.status === "live"
                      ? "live updates"
                      : realtime.status === "reconnecting"
                        ? "reconnecting"
                        : "connecting"}
                  </span>
                </div>
              </header>

              {isLoadingMessages ? (
                <p>Loading messages...</p>
              ) : messages.length === 0 ? (
                <div className="feature-list">
                  <li>This direct message has no messages yet.</li>
                  <li>Send the first message, reply to it, or edit and delete your own messages.</li>
                </div>
              ) : (
                <div
                  ref={messageListRef}
                  className="message-list message-list--scrollable"
                  onScroll={handleMessageListScroll}
                >
                  {hasOlderMessages ? (
                    <div className="message-history-banner">
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={isLoadingOlderMessages}
                        onClick={() => {
                          void loadOlderMessages();
                        }}
                      >
                        {isLoadingOlderMessages
                          ? "Loading older messages..."
                          : "Load older messages"}
                      </button>
                    </div>
                  ) : null}
                  {messages.map((message) => (
                    <article key={message.id} className="message-card">
                      {message.reply_to_message ? (
                        <div className="message-reply-reference">
                          <strong>Replying to</strong>
                          <p>{getReplyPreview(message)}</p>
                        </div>
                      ) : null}
                      <header>
                        <strong>{message.author_username}</strong>
                        <div className="message-meta">
                          <time>{formatMessageTime(message.created_at)}</time>
                          {message.is_edited ? <span className="message-flag">edited</span> : null}
                          <span className="message-flag">#{message.sequence_number}</span>
                        </div>
                      </header>
                      <p
                        className={
                          message.is_deleted ? "message-body message-body--deleted" : "message-body"
                        }
                      >
                        {message.is_deleted ? "Message deleted." : message.body_text}
                      </p>
                      {!message.is_deleted ? (
                        <div className="message-actions">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => handleReply(message)}
                          >
                            Reply
                          </button>
                          {message.can_edit ? (
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => handleEdit(message)}
                            >
                              Edit
                            </button>
                          ) : null}
                          {message.can_delete ? (
                            <button
                              className="ghost-button"
                              type="button"
                              disabled={updatingMessageId === message.id}
                              onClick={() => {
                                void handleDelete(message);
                              }}
                            >
                              {updatingMessageId === message.id ? "Deleting..." : "Delete"}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}

              <footer className="composer-shell">
                <form className="composer-form" onSubmit={handleSubmitMessage}>
                  <div className="composer-toolbar">
                    <button type="button">Attach</button>
                    <span>
                      {editingMessageId !== null
                        ? "Editing an existing message."
                        : "Direct messages now persist with replies, edits, deletes, and continuity sequence numbers."}
                    </span>
                  </div>
                  {replyTarget ? (
                    <div className="composer-context-banner">
                      <span>Replying to {replyTarget.author_username}</span>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setReplyTarget(null)}
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                  {editingMessageId !== null ? (
                    <div className="composer-context-banner">
                      <span>Editing message #{editingMessageId}</span>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => resetComposerState()}
                      >
                        Cancel edit
                      </button>
                    </div>
                  ) : null}
                  <textarea
                    rows={4}
                    maxLength={3072}
                    placeholder="Write a direct message"
                    value={composeText}
                    onChange={(event) => setComposeText(event.target.value)}
                  />
                  <div className="composer-actions">
                    <button className="ghost-button" type="button" onClick={() => resetComposerState()}>
                      Clear
                    </button>
                    <button className="primary-button" type="submit" disabled={isSubmittingMessage}>
                      {isSubmittingMessage
                        ? editingMessageId !== null
                          ? "Saving..."
                          : "Sending..."
                        : editingMessageId !== null
                          ? "Save edit"
                          : "Send"}
                    </button>
                  </div>
                </form>
              </footer>
            </>
          ) : (
            <div className="feature-list">
              <li>Open a direct message by username from the right panel.</li>
              <li>Existing one-to-one conversations stay listed and selectable here.</li>
              <li>The next history and realtime tasks will build on the same conversation backbone.</li>
            </div>
          )}
        </div>

        <aside className="room-context-rail room-context-rail--narrow">
          <article className="session-card room-people-card room-people-card--bounded">
            <div className="room-context-card-header">
              <div>
                <p className="session-card-kicker">Existing conversations</p>
                <h2>Direct messages</h2>
              </div>
              <span className="sidebar-muted">{directMessages.length}</span>
            </div>
            {isLoading ? (
              <p>Loading direct messages...</p>
            ) : directMessages.length === 0 ? (
              <p>No direct messages yet. Open your first one by username.</p>
            ) : (
              <ul className="room-people-list room-people-list--scrollable">
                {directMessages.map((directMessage) => (
                  <li key={directMessage.id} className="room-people-item">
                    <button
                      className={
                        selectedDirectMessageId === directMessage.id
                          ? "sidebar-room-button is-active"
                          : "sidebar-room-button"
                      }
                      type="button"
                      onClick={() => {
                        setSelectedDirectMessageId(directMessage.id);
                        setErrorMessage(null);
                        setNoticeMessage(null);
                      }}
                    >
                      <span>{directMessage.counterpart_username}</span>
                      <small>Direct message</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </aside>
      </div>
    </section>
  );
}
