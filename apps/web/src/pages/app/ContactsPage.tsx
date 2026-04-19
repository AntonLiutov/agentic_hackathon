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
import { useDirectMessages } from "../../features/direct-messages/use-direct-messages";
import { useFriends } from "../../features/friends/use-friends";
import {
  type FriendRequestSummary,
  type FriendSummary,
} from "../../shared/api/friends";
import {
  messagesApi,
  type ConversationMessage,
} from "../../shared/api/messages";
import { useWorkspaceContextPanel } from "../../features/layout/workspace-context-panel";
import { usePresence } from "../../features/presence/use-presence";
import { useSession } from "../../features/session/use-session";
import { useConversationRealtime } from "../../shared/realtime/useConversationRealtime";

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
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

function formatPresenceLabel(presenceStatus: "online" | "afk" | "offline") {
  return presenceStatus === "afk" ? "AFK" : presenceStatus;
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
  const { user } = useSession();
  const { getPresence, setMany } = usePresence();
  const { setPanelContent } = useWorkspaceContextPanel();
  const {
    acceptFriendRequest,
    friends,
    incomingRequests,
    outgoingRequests,
    rejectFriendRequest,
    removeFriend,
    sendFriendRequest,
  } = useFriends();
  const {
    clearMessages: clearDirectMessageMessages,
    clearUnread,
    directMessages,
    errorMessage: directMessagesError,
    isLoading,
    noticeMessage: directMessagesNotice,
    openDirectMessage,
    refreshDirectMessages,
    selectedDirectMessage,
    selectedDirectMessageId,
    selectDirectMessage,
  } = useDirectMessages();
  const [directMessageUsername, setDirectMessageUsername] = useState("");
  const [friendRequestUsername, setFriendRequestUsername] = useState("");
  const [friendRequestMessage, setFriendRequestMessage] = useState("");
  const [composeText, setComposeText] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sequenceHead, setSequenceHead] = useState(0);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [replyTarget, setReplyTarget] = useState<ConversationMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingFriendRequest, setIsSubmittingFriendRequest] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [updatingMessageId, setUpdatingMessageId] = useState<number | null>(null);
  const [processingFriendRequestId, setProcessingFriendRequestId] = useState<string | null>(null);
  const [removingFriendUserId, setRemovingFriendUserId] = useState<string | null>(null);
  const [pageErrorMessage, setPageErrorMessage] = useState<string | null>(null);
  const [pageNoticeMessage, setPageNoticeMessage] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{ previousHeight: number; previousTop: number } | null>(
    null,
  );

  useEffect(() => {
    if (directMessages.length === 0) {
      return;
    }

    setMany(
      directMessages.map((directMessage) => ({
        userId: directMessage.counterpart_user_id,
        status: directMessage.counterpart_presence_status,
      })),
    );
  }, [directMessages, setMany]);

  useEffect(() => {
    if (friends.length === 0) {
      return;
    }

    setMany(
      friends.map((friend) => ({
        userId: friend.user_id,
        status: friend.presence_status,
      })),
    );
  }, [friends, setMany]);

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
  }, [isLoadingMessages, messages]);

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
        clearDirectMessageMessages();
        return;
      }

      setIsLoadingMessages(true);
      setPageErrorMessage(null);
      shouldAutoScrollRef.current = true;

      try {
        await loadLatestMessages(selectedDirectMessageId);
        await messagesApi.markRead(selectedDirectMessageId);
        clearUnread(selectedDirectMessageId);

        if (isCancelled) {
          return;
        }
      } catch (error) {
        if (!isCancelled) {
          setPageErrorMessage(getApiErrorMessage(error, "Unable to load direct messages right now."));
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
  }, [clearDirectMessageMessages, clearUnread, loadLatestMessages, selectedDirectMessageId]);

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
      setPageErrorMessage(getApiErrorMessage(error, "Unable to load older messages right now."));
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
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
    setIsSubmitting(true);

    try {
      await openDirectMessage({ username: directMessageUsername });
      setDirectMessageUsername("");
    } catch (error) {
      setPageErrorMessage(getApiErrorMessage(error, "Unable to open that direct message right now."));
    } finally {
      setIsSubmitting(false);
    }
  }, [directMessageUsername, openDirectMessage]);

  const handleSendFriendRequest = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPageErrorMessage(null);
      setPageNoticeMessage(null);
      setIsSubmittingFriendRequest(true);

      try {
        const friendRequest = await sendFriendRequest({
          username: friendRequestUsername,
          message: friendRequestMessage.trim() ? friendRequestMessage.trim() : undefined,
        });
        setFriendRequestUsername("");
        setFriendRequestMessage("");
        setPageNoticeMessage(`Friend request sent to ${friendRequest.recipient_username}.`);
      } catch (error) {
        setPageErrorMessage(
          getApiErrorMessage(error, "Unable to send that friend request right now."),
        );
      } finally {
        setIsSubmittingFriendRequest(false);
      }
    },
    [friendRequestMessage, friendRequestUsername, sendFriendRequest],
  );

  async function handleAcceptFriendRequest(friendRequest: FriendRequestSummary) {
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
    setProcessingFriendRequestId(friendRequest.id);

    try {
      const acceptedFriend = await acceptFriendRequest(friendRequest.id);
      await refreshDirectMessages();
      setPageNoticeMessage(`You are now friends with ${acceptedFriend.username}.`);
    } catch (error) {
      setPageErrorMessage(getApiErrorMessage(error, "Unable to accept that friend request."));
    } finally {
      setProcessingFriendRequestId(null);
    }
  }

  async function handleRejectFriendRequest(friendRequest: FriendRequestSummary) {
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
    setProcessingFriendRequestId(friendRequest.id);

    try {
      await rejectFriendRequest(friendRequest.id);
      setPageNoticeMessage(`Friend request from ${friendRequest.requester_username} rejected.`);
    } catch (error) {
      setPageErrorMessage(getApiErrorMessage(error, "Unable to reject that friend request."));
    } finally {
      setProcessingFriendRequestId(null);
    }
  }

  async function handleRemoveFriend(friend: FriendSummary) {
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
    setRemovingFriendUserId(friend.user_id);

    try {
      await removeFriend(friend.user_id);
      setPageNoticeMessage(`${friend.username} removed from your friends list.`);
    } catch (error) {
      setPageErrorMessage(getApiErrorMessage(error, "Unable to remove that friend right now."));
    } finally {
      setRemovingFriendUserId(null);
    }
  }

  async function handleOpenFriendDirectMessage(friend: FriendSummary) {
    setPageErrorMessage(null);
    setPageNoticeMessage(null);

    try {
      await openDirectMessage({ username: friend.username });
      setPageNoticeMessage(`Direct message ready with ${friend.username}.`);
    } catch (error) {
      setPageErrorMessage(
        getApiErrorMessage(error, "Unable to open that direct message right now."),
      );
    }
  }

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

    setPageErrorMessage(null);
    setPageNoticeMessage(null);
    setIsSubmittingMessage(true);

    try {
      if (editingMessageId !== null) {
        const updatedMessage = await messagesApi.edit(editingMessageId, {
          body_text: composeText,
        });
        setMessages((currentMessages) =>
          upsertConversationMessage(currentMessages, updatedMessage),
        );
        setPageNoticeMessage("Message updated.");
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
      setPageErrorMessage(getApiErrorMessage(error, "Unable to save that message right now."));
    } finally {
      setIsSubmittingMessage(false);
    }
  }

  function handleReply(message: ConversationMessage) {
    setEditingMessageId(null);
    setReplyTarget(message);
    setComposeText("");
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
  }

  function handleEdit(message: ConversationMessage) {
    setReplyTarget(null);
    setEditingMessageId(message.id);
    setComposeText(message.body_text ?? "");
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
  }

  async function handleDelete(message: ConversationMessage) {
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
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
      setPageErrorMessage(getApiErrorMessage(error, "Unable to delete that message right now."));
    } finally {
      setUpdatingMessageId(null);
    }
  }

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
        if (message.author_user_id && message.author_user_id !== user?.id && selectedDirectMessageId) {
          void messagesApi.markRead(selectedDirectMessageId).then(() => {
            clearUnread(selectedDirectMessageId);
          });
        }
      },
      [clearUnread, loadLatestMessages, selectedDirectMessageId, user?.id],
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
                value={directMessageUsername}
                onChange={(event) => setDirectMessageUsername(event.target.value)}
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

        <div className="context-block">
          <strong>Send friend request</strong>
          <form className="auth-form" onSubmit={handleSendFriendRequest}>
            <label>
              <span>Username</span>
              <input
                type="text"
                placeholder="alice"
                value={friendRequestUsername}
                onChange={(event) => setFriendRequestUsername(event.target.value)}
                minLength={3}
                maxLength={64}
                required
              />
            </label>
            <label>
              <span>Message</span>
              <input
                type="text"
                placeholder="Optional note"
                value={friendRequestMessage}
                onChange={(event) => setFriendRequestMessage(event.target.value)}
                maxLength={500}
              />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmittingFriendRequest}>
              {isSubmittingFriendRequest ? "Sending..." : "Send friend request"}
            </button>
          </form>
        </div>

        <div className="context-block">
          <strong>Friends</strong>
          {friends.length === 0 ? (
            <p>No friends yet.</p>
          ) : (
            <ul className="contacts-stack">
              {friends.map((friend) => (
                <li key={friend.friendship_id} className="contacts-list-item">
                  <div>
                    <span>{friend.username}</span>
                    <small className="presence-inline">
                      <span
                        className={`presence-dot presence-dot--${
                          getPresence(friend.user_id) ?? friend.presence_status ?? "offline"
                        }`}
                      />
                      {formatPresenceLabel(
                        getPresence(friend.user_id) ?? friend.presence_status ?? "offline",
                      )}
                    </small>
                  </div>
                  <div className="contacts-inline-actions">
                    <button
                      className="ghost-button sidebar-action-button"
                      type="button"
                      onClick={() => {
                        void handleOpenFriendDirectMessage(friend);
                      }}
                    >
                      Open DM
                    </button>
                    <button
                      className="ghost-button sidebar-action-button"
                      type="button"
                      disabled={removingFriendUserId === friend.user_id}
                      onClick={() => {
                        void handleRemoveFriend(friend);
                      }}
                    >
                      {removingFriendUserId === friend.user_id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="context-block">
          <strong>Incoming requests</strong>
          {incomingRequests.length === 0 ? (
            <p>No incoming requests.</p>
          ) : (
            <ul className="contacts-stack">
              {incomingRequests.map((friendRequest) => (
                <li key={friendRequest.id} className="contacts-list-item">
                  <div>
                    <span>{friendRequest.requester_username}</span>
                    <small>
                      {friendRequest.request_text ?? "No message"} •{" "}
                      {formatDateTime(friendRequest.created_at)}
                    </small>
                  </div>
                  <div className="contacts-inline-actions">
                    <button
                      className="ghost-button sidebar-action-button"
                      type="button"
                      disabled={processingFriendRequestId === friendRequest.id}
                      onClick={() => {
                        void handleAcceptFriendRequest(friendRequest);
                      }}
                    >
                      {processingFriendRequestId === friendRequest.id ? "Saving..." : "Accept"}
                    </button>
                    <button
                      className="ghost-button sidebar-action-button"
                      type="button"
                      disabled={processingFriendRequestId === friendRequest.id}
                      onClick={() => {
                        void handleRejectFriendRequest(friendRequest);
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="context-block">
          <strong>Outgoing requests</strong>
          {outgoingRequests.length === 0 ? (
            <p>No outgoing requests.</p>
          ) : (
            <ul className="contacts-stack">
              {outgoingRequests.map((friendRequest) => (
                <li key={friendRequest.id} className="contacts-list-item">
                  <div>
                    <span>{friendRequest.recipient_username}</span>
                    <small>
                      {friendRequest.request_text ?? "Awaiting response"} •{" "}
                      {formatDateTime(friendRequest.created_at)}
                    </small>
                  </div>
                  <span className="sidebar-muted">Pending</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    ),
    [
      friendRequestMessage,
      friendRequestUsername,
      friends,
      getPresence,
      handleOpenDirectMessage,
      handleSendFriendRequest,
      incomingRequests,
      isSubmitting,
      isSubmittingFriendRequest,
      outgoingRequests,
      processingFriendRequestId,
      refreshDirectMessages,
      removingFriendUserId,
      directMessageUsername,
    ],
  );

  useEffect(() => {
    setPanelContent(contactsPanelContent);

    return () => {
      setPanelContent(null);
    };
  }, [contactsPanelContent, setPanelContent]);

  return (
    <section className="chat-workspace card">
      {directMessagesError ? <p className="auth-error">{directMessagesError}</p> : null}
      {directMessagesNotice ? <p className="auth-success">{directMessagesNotice}</p> : null}
      {pageErrorMessage ? <p className="auth-error">{pageErrorMessage}</p> : null}
      {pageNoticeMessage ? <p className="auth-success">{pageNoticeMessage}</p> : null}

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
                    {formatPresenceLabel(
                      getPresence(selectedDirectMessage.counterpart_user_id) ??
                        selectedDirectMessage.counterpart_presence_status ??
                        "offline",
                    )}
                  </span>
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
                        selectDirectMessage(directMessage.id);
                        setPageErrorMessage(null);
                        setPageNoticeMessage(null);
                      }}
                    >
                      <span>{directMessage.counterpart_username}</span>
                      <small className="presence-inline">
                        <span
                          className={`presence-dot presence-dot--${
                            getPresence(directMessage.counterpart_user_id) ??
                            directMessage.counterpart_presence_status ??
                            "offline"
                          }`}
                        />
                        {formatPresenceLabel(
                          getPresence(directMessage.counterpart_user_id) ??
                            directMessage.counterpart_presence_status ??
                            "offline",
                        )}
                      </small>
                      {directMessage.unread_count > 0 ? (
                        <span className="sidebar-badge">{directMessage.unread_count}</span>
                      ) : null}
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
