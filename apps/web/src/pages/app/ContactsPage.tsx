import {
  type ChangeEvent,
  type ClipboardEvent,
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
import { type BlockedUserSummary } from "../../shared/api/blocks";
import {
  type FriendRequestSummary,
  type FriendSummary,
} from "../../shared/api/friends";
import {
  getAttachmentAssetUrl,
  messagesApi,
  type ConversationMessage,
} from "../../shared/api/messages";
import { EmojiPicker } from "../../shared/chat/EmojiPicker";
import { appendEmoji } from "../../shared/chat/emoji";
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

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MESSAGE_PAGE_SIZE = 30;

function getAttachmentValidationError(file: File) {
  const isImage = file.type.startsWith("image/");
  const sizeLimit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;

  if (file.size > sizeLimit) {
    return `${file.name} is too large. ${
      isImage ? "Images must be 3 MB or smaller." : "Files must be 20 MB or smaller."
    }`;
  }

  return null;
}

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
    blockedUsers,
    blockUser,
    friends,
    incomingRequests,
    isUserBlocked,
    outgoingRequests,
    rejectFriendRequest,
    removeFriend,
    sendFriendRequest,
    unblockUser,
  } = useFriends();
  const {
    clearMessages: clearDirectMessageMessages,
    clearUnread,
    directMessages,
    errorMessage: directMessagesError,
    hasExplicitSelection,
    isLoading,
    noticeMessage: directMessagesNotice,
    openDirectMessage,
    refreshDirectMessages,
    selectedDirectMessage,
    selectedDirectMessageId,
    selectDirectMessage,
  } = useDirectMessages();
  const [friendRequestUsername, setFriendRequestUsername] = useState("");
  const [friendRequestMessage, setFriendRequestMessage] = useState("");
  const [composeText, setComposeText] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [, setSequenceHead] = useState(0);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [replyTarget, setReplyTarget] = useState<ConversationMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isSubmittingFriendRequest, setIsSubmittingFriendRequest] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [updatingMessageId, setUpdatingMessageId] = useState<number | null>(null);
  const [processingFriendRequestId, setProcessingFriendRequestId] = useState<string | null>(null);
  const [removingFriendUserId, setRemovingFriendUserId] = useState<string | null>(null);
  const [blockingUsername, setBlockingUsername] = useState<string | null>(null);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);
  const [pageErrorMessage, setPageErrorMessage] = useState<string | null>(null);
  const [pageNoticeMessage, setPageNoticeMessage] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentComment, setAttachmentComment] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
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

        if (hasExplicitSelection) {
          await messagesApi.markRead(selectedDirectMessageId);
          clearUnread(selectedDirectMessageId);
        }

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
  }, [
    clearDirectMessageMessages,
    clearUnread,
    hasExplicitSelection,
    loadLatestMessages,
    selectedDirectMessage?.can_message,
    selectedDirectMessage?.counterpart_username,
    selectedDirectMessage?.status,
    selectedDirectMessageId,
  ]);

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

  async function handleBlockUsername(username: string) {
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
    setBlockingUsername(username);

    try {
      const blockedUser = await blockUser({ username });
      await refreshDirectMessages();
      setPageNoticeMessage(`${blockedUser.blocked_username} blocked.`);
    } catch (error) {
      setPageErrorMessage(getApiErrorMessage(error, "Unable to block that user right now."));
    } finally {
      setBlockingUsername(null);
    }
  }

  async function handleUnblockUser(blockedUser: BlockedUserSummary) {
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
    setUnblockingUserId(blockedUser.blocked_user_id);

    try {
      await unblockUser(blockedUser.blocked_user_id);
      await refreshDirectMessages();
      setPageNoticeMessage(`${blockedUser.blocked_username} unblocked.`);
    } catch (error) {
      setPageErrorMessage(getApiErrorMessage(error, "Unable to unblock that user right now."));
    } finally {
      setUnblockingUserId(null);
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
    setPendingFiles([]);
    setAttachmentComment("");
    setComposerError(null);
    setIsEmojiPickerOpen(false);
  }

  function handleInsertEmoji(emoji: string) {
    setComposeText((currentValue) => appendEmoji(currentValue, emoji));
    setIsEmojiPickerOpen(false);
  }

  function addPendingFiles(nextFiles: File[]) {
    const validationError = nextFiles
      .map((file) => getAttachmentValidationError(file))
      .find((errorMessage) => errorMessage !== null);

    if (validationError) {
      setComposerError(validationError);
    } else {
      setComposerError(null);
    }

    setPendingFiles((currentFiles) => {
      const seen = new Set(currentFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const uniqueFiles = nextFiles.filter((file) => {
        if (getAttachmentValidationError(file)) {
          return false;
        }
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      return [...currentFiles, ...uniqueFiles];
    });
  }

  function handleAttachmentSelection(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);
    if (nextFiles.length > 0) {
      addPendingFiles(nextFiles);
    }
    event.target.value = "";
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (editingMessageId !== null) {
      return;
    }

    const clipboardFiles = Array.from(event.clipboardData.files ?? []);
    if (clipboardFiles.length === 0) {
      return;
    }

    event.preventDefault();
    addPendingFiles(clipboardFiles);
  }

  function removePendingFile(fileToRemove: File) {
    setPendingFiles((currentFiles) =>
      currentFiles.filter(
        (file) =>
          !(
            file.name === fileToRemove.name &&
            file.size === fileToRemove.size &&
            file.lastModified === fileToRemove.lastModified
          ),
      ),
    );
  }

  async function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDirectMessage) {
      return;
    }

    const normalizedBodyText = composeText.trim();
    const hasAttachments = pendingFiles.length > 0;

    if (editingMessageId !== null && !normalizedBodyText) {
      return;
    }

    if (editingMessageId === null && !normalizedBodyText && !hasAttachments) {
      return;
    }

    setPageErrorMessage(null);
    setPageNoticeMessage(null);
    setIsSubmittingMessage(true);
    setComposerError(null);

    try {
      if (editingMessageId !== null) {
        const updatedMessage = await messagesApi.edit(editingMessageId, {
          body_text: normalizedBodyText,
        });
        setMessages((currentMessages) =>
          upsertConversationMessage(currentMessages, updatedMessage),
        );
        setPageNoticeMessage("Message updated.");
      } else {
        shouldAutoScrollRef.current = isNearBottom();
        const createdMessage = hasAttachments
          ? await messagesApi.createWithAttachments(selectedDirectMessage.id, {
              body_text: normalizedBodyText || undefined,
              reply_to_message_id: replyTarget?.id,
              attachment_comment: attachmentComment.trim() || undefined,
              files: pendingFiles,
            })
          : await messagesApi.create(selectedDirectMessage.id, {
              body_text: normalizedBodyText,
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
    setPendingFiles([]);
    setAttachmentComment("");
    setComposerError(null);
    setPageErrorMessage(null);
    setPageNoticeMessage(null);
  }

  function handleEdit(message: ConversationMessage) {
    setReplyTarget(null);
    setEditingMessageId(message.id);
    setComposeText(message.body_text ?? "");
    setPendingFiles([]);
    setAttachmentComment("");
    setComposerError(null);
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
        if (
          hasExplicitSelection &&
          message.author_user_id &&
          message.author_user_id !== user?.id &&
          selectedDirectMessageId
        ) {
          void messagesApi.markRead(selectedDirectMessageId).then(() => {
            clearUnread(selectedDirectMessageId);
          });
        }
      },
      [clearUnread, hasExplicitSelection, loadLatestMessages, selectedDirectMessageId, user?.id],
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
    onConnected: useCallback(() => {
      if (!selectedDirectMessageId) {
        return;
      }

      void refreshDirectMessages();
      void loadLatestMessages(selectedDirectMessageId);
    }, [loadLatestMessages, refreshDirectMessages, selectedDirectMessageId]),
  });

  const contactsPanelContent = useMemo<ReactNode>(
    () => (
      <>
        <h3>Direct messages</h3>
        <p>Friends can chat one to one, with the same message and file features as rooms.</p>

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
                      disabled={blockingUsername === friend.username}
                      onClick={() => {
                        void handleBlockUsername(friend.username);
                      }}
                    >
                      {blockingUsername === friend.username ? "Blocking..." : "Block"}
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
                      {friendRequest.request_text ?? "No message"} ·{" "}
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
                    <button
                      className="ghost-button sidebar-action-button"
                      type="button"
                      disabled={blockingUsername === friendRequest.requester_username}
                      onClick={() => {
                        void handleBlockUsername(friendRequest.requester_username);
                      }}
                    >
                      {blockingUsername === friendRequest.requester_username
                        ? "Blocking..."
                        : "Block"}
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
                      {friendRequest.request_text ?? "Awaiting response"} ·{" "}
                      {formatDateTime(friendRequest.created_at)}
                    </small>
                  </div>
                  <span className="sidebar-muted">Pending</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="context-block">
          <strong>Blocked users</strong>
          {blockedUsers.length === 0 ? (
            <p>No blocked users.</p>
          ) : (
            <ul className="contacts-stack">
              {blockedUsers.map((blockedUser) => (
                <li key={blockedUser.block_id} className="contacts-list-item">
                  <div>
                    <span>{blockedUser.blocked_username}</span>
                    <small>
                      {blockedUser.reason ?? "No reason"} · {formatDateTime(blockedUser.blocked_at)}
                    </small>
                  </div>
                  <button
                    className="ghost-button sidebar-action-button"
                    type="button"
                    disabled={unblockingUserId === blockedUser.blocked_user_id}
                    onClick={() => {
                      void handleUnblockUser(blockedUser);
                    }}
                  >
                    {unblockingUserId === blockedUser.blocked_user_id ? "Saving..." : "Unblock"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    ),
    [
      blockedUsers,
      blockingUsername,
      friendRequestMessage,
      friendRequestUsername,
      friends,
      getPresence,
      handleSendFriendRequest,
      incomingRequests,
      isSubmittingFriendRequest,
      outgoingRequests,
      processingFriendRequestId,
      removingFriendUserId,
      unblockingUserId,
    ],
  );

  useEffect(() => {
    setPanelContent(contactsPanelContent);

    return () => {
      setPanelContent(null);
    };
  }, [contactsPanelContent, setPanelContent]);

  return (
    <section className="chat-workspace card chat-workspace--conversation">
      {directMessagesError ? <p className="auth-error">{directMessagesError}</p> : null}
      {directMessagesNotice ? <p className="auth-success">{directMessagesNotice}</p> : null}
      {pageErrorMessage ? <p className="auth-error">{pageErrorMessage}</p> : null}
      {pageNoticeMessage ? <p className="auth-success">{pageNoticeMessage}</p> : null}

      <div className="chat-room-layout chat-room-layout--single">
        <div className="chat-room-main chat-room-main--conversation">
          {selectedDirectMessage ? (
            <>
              <header className="chat-header conversation-header">
                <div className="conversation-header-main">
                  <h1>{selectedDirectMessage.counterpart_username}</h1>
                  <div className="conversation-meta-row">
                    <span className="conversation-meta-chip" title="Direct message">
                      <span aria-hidden="true">#</span>
                      Direct message
                    </span>
                    <span
                      className="conversation-meta-chip"
                      title={formatPresenceLabel(
                        getPresence(selectedDirectMessage.counterpart_user_id) ??
                          selectedDirectMessage.counterpart_presence_status ??
                          "offline",
                      )}
                    >
                      <span
                        className={`presence-dot presence-dot--${
                          getPresence(selectedDirectMessage.counterpart_user_id) ??
                          selectedDirectMessage.counterpart_presence_status ??
                          "offline"
                        }`}
                      />
                      {formatPresenceLabel(
                        getPresence(selectedDirectMessage.counterpart_user_id) ??
                          selectedDirectMessage.counterpart_presence_status ??
                          "offline",
                      )}
                    </span>
                    <span className="conversation-meta-chip" title={selectedDirectMessage.status}>
                      <span aria-hidden="true">@</span>
                      {selectedDirectMessage.status === "active" ? "Active" : selectedDirectMessage.status}
                    </span>
                    <span
                      className="conversation-meta-chip"
                      title={realtime.status === "live" ? "Live updates" : "Sync status"}
                    >
                      <span
                        className={
                          realtime.status === "live"
                            ? "conversation-live-dot conversation-live-dot--live"
                            : "conversation-live-dot conversation-live-dot--syncing"
                        }
                      />
                      {realtime.status === "live"
                        ? "Live"
                        : realtime.status === "reconnecting"
                          ? "Syncing"
                          : "Connecting"}
                    </span>
                  </div>
                </div>

                <div className="conversation-header-actions">
                  {isUserBlocked(selectedDirectMessage.counterpart_user_id) ? (
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={unblockingUserId === selectedDirectMessage.counterpart_user_id}
                      onClick={() => {
                        const blockedUser = blockedUsers.find(
                          (currentBlockedUser) =>
                            currentBlockedUser.blocked_user_id ===
                            selectedDirectMessage.counterpart_user_id,
                        );
                        if (blockedUser) {
                          void handleUnblockUser(blockedUser);
                        }
                      }}
                    >
                      {unblockingUserId === selectedDirectMessage.counterpart_user_id
                        ? "Saving..."
                        : "Unblock user"}
                    </button>
                  ) : (
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={blockingUsername === selectedDirectMessage.counterpart_username}
                      onClick={() => {
                        void handleBlockUsername(selectedDirectMessage.counterpart_username);
                      }}
                    >
                      {blockingUsername === selectedDirectMessage.counterpart_username
                        ? "Blocking..."
                        : "Block user"}
                    </button>
                  )}
                </div>
              </header>

              {isLoadingMessages ? (
                <p>Loading messages...</p>
              ) : messages.length === 0 ? (
                <div className="feature-list">
                  {!selectedDirectMessage.can_message ? (
                    <li>This conversation is read-only right now.</li>
                  ) : null}
                  <li>No messages yet.</li>
                  <li>
                    {selectedDirectMessage.can_message
                      ? "Send the first message to get the conversation started."
                      : "Messaging is unavailable because the friendship is inactive or one user blocked the other."}
                  </li>
                </div>
              ) : (
                <>
                  {!selectedDirectMessage.can_message ? (
                    <div className="feature-list">
                      <li>This conversation is read-only right now.</li>
                      <li>
                        Messaging is unavailable because the friendship is inactive or one user
                        blocked the other.
                      </li>
                    </div>
                  ) : null}
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
                            : "Older messages"}
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
                          </div>
                        </header>
                        <p
                          className={
                            message.is_deleted ? "message-body message-body--deleted" : "message-body"
                          }
                        >
                          {message.is_deleted ? "Message deleted." : message.body_text}
                        </p>
                        {!message.is_deleted && (message.attachments ?? []).length > 0 ? (
                          <div className="message-attachments">
                            {(message.attachments ?? []).map((attachment) => (
                              <article key={attachment.id} className="message-attachment-card">
                                {attachment.is_image ? (
                                  <img
                                    className="message-attachment-preview"
                                    src={getAttachmentAssetUrl(attachment.content_path)}
                                    alt={attachment.original_filename}
                                    loading="lazy"
                                  />
                                ) : null}
                                <div className="message-attachment-meta">
                                  <div className="message-attachment-summary">
                                    <strong className="message-attachment-name">
                                      {attachment.original_filename}
                                    </strong>
                                    <small>{formatAttachmentSize(attachment.size_bytes)}</small>
                                    {attachment.comment_text ? <p>{attachment.comment_text}</p> : null}
                                  </div>
                                  <a
                                    className="ghost-button ghost-button--link"
                                    href={getAttachmentAssetUrl(attachment.download_path)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Download
                                  </a>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : null}
                        {!message.is_deleted && selectedDirectMessage.can_message ? (
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
                </>
              )}

              <footer className="composer-shell composer-shell--compact">
                <form className="composer-form" onSubmit={handleSubmitMessage}>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={handleAttachmentSelection}
                  />
                  <div className="composer-toolbar composer-toolbar--compact">
                    <button
                      className="composer-icon-button"
                      type="button"
                      aria-label="Emoji"
                      title="Emoji"
                      disabled={!selectedDirectMessage.can_message}
                      onClick={() => setIsEmojiPickerOpen((currentValue) => !currentValue)}
                    >
                      😊
                    </button>
                    <button
                      className="composer-icon-button"
                      type="button"
                      aria-label="Attach"
                      title="Attach"
                      disabled={editingMessageId !== null || !selectedDirectMessage.can_message}
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      📎
                    </button>
                    {editingMessageId !== null ? (
                      <span className="composer-toolbar-note">Editing message</span>
                    ) : null}
                  </div>
                  {isEmojiPickerOpen ? (
                    <EmojiPicker
                      disabled={!selectedDirectMessage.can_message}
                      onSelect={handleInsertEmoji}
                    />
                  ) : null}
                  {composerError ? (
                    <p className="composer-feedback composer-feedback--error">{composerError}</p>
                  ) : null}
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
                  {pendingFiles.length > 0 ? (
                    <div className="composer-attachments">
                      <div className="composer-attachments-header">
                        <strong>Attachments</strong>
                        <span>{pendingFiles.length} selected</span>
                      </div>
                      <ul className="composer-attachment-list">
                        {pendingFiles.map((file) => (
                          <li
                            key={`${file.name}:${file.size}:${file.lastModified}`}
                            className="composer-attachment-item"
                          >
                            <div>
                              <strong>{file.name}</strong>
                              <small>{formatAttachmentSize(file.size)}</small>
                            </div>
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => removePendingFile(file)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                      <input
                        type="text"
                        maxLength={500}
                        placeholder="Optional attachment comment"
                        value={attachmentComment}
                        disabled={!selectedDirectMessage.can_message}
                        onChange={(event) => setAttachmentComment(event.target.value)}
                      />
                    </div>
                  ) : null}
                  <textarea
                    rows={3}
                    maxLength={3072}
                    placeholder="Write a direct message"
                    disabled={!selectedDirectMessage.can_message}
                    value={composeText}
                    onChange={(event) => setComposeText(event.target.value)}
                    onPaste={handleComposerPaste}
                  />
                  <div className="composer-actions composer-actions--compact">
                    <button className="ghost-button" type="button" onClick={() => resetComposerState()}>
                      Clear
                    </button>
                    <button
                      className="ghost-button composer-send-button"
                      type="submit"
                      disabled={isSubmittingMessage || !selectedDirectMessage.can_message}
                    >
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
              <li>Open a direct message from the friend list.</li>
              <li>Only friends can chat here.</li>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
