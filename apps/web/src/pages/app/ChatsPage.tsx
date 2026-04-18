import {
  type FormEvent,
  type UIEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useRooms } from "../../features/rooms/use-rooms";
import { ApiError, getApiErrorMessage } from "../../shared/api/client";
import {
  messagesApi,
  type ConversationMessage,
} from "../../shared/api/messages";
import { roomsApi, type RoomBan, type RoomMember } from "../../shared/api/rooms";

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

export function ChatsPage() {
  const { inviteToRoom, joinRoom, leaveRoom, refreshRooms, selectedRoom } = useRooms();
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [bans, setBans] = useState<RoomBan[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sequenceHead, setSequenceHead] = useState(0);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [nextBeforeSequence, setNextBeforeSequence] = useState<number | null>(null);
  const [composeText, setComposeText] = useState("");
  const [replyTarget, setReplyTarget] = useState<ConversationMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [updatingMessageId, setUpdatingMessageId] = useState<number | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{ previousHeight: number; previousTop: number } | null>(
    null,
  );

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
    const activeRoomId = selectedRoom?.id;
    const isMember = selectedRoom?.is_member ?? false;
    const canManageMembers = selectedRoom?.can_manage_members ?? false;

    async function loadRoomPeople() {
      if (!activeRoomId || !isMember) {
        setMembers([]);
        setBans([]);
        setIsLoadingPeople(false);
        return;
      }

      setIsLoadingPeople(true);

      try {
        const [memberResponse, banResponse] = await Promise.all([
          roomsApi.listMembers(activeRoomId),
          canManageMembers ? roomsApi.listBans(activeRoomId) : Promise.resolve({ bans: [] }),
        ]);

        if (isCancelled) {
          return;
        }

        setMembers(memberResponse.members);
        setBans(banResponse.bans);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          await refreshRooms();
          setPanelError("You no longer have access to that room.");
          return;
        }

        setPanelError(getApiErrorMessage(error, "Unable to load room membership right now."));
      } finally {
        if (!isCancelled) {
          setIsLoadingPeople(false);
        }
      }
    }

    void loadRoomPeople();

    return () => {
      isCancelled = true;
    };
  }, [selectedRoom?.id, selectedRoom?.is_member, selectedRoom?.can_manage_members]);

  useEffect(() => {
    let isCancelled = false;
    const activeRoomId = selectedRoom?.id;
    const isMember = selectedRoom?.is_member ?? false;

    async function loadMessages() {
      if (!activeRoomId || !isMember) {
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
      shouldAutoScrollRef.current = true;

      try {
        const response = await messagesApi.list(activeRoomId, MESSAGE_PAGE_SIZE);

        if (isCancelled) {
          return;
        }

        setMessages(response.messages);
        setSequenceHead(response.sequence_head);
        setHasOlderMessages(response.has_older);
        setNextBeforeSequence(response.next_before_sequence);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          await refreshRooms();
          setPanelError("You no longer have access to that room.");
          return;
        }

        setPanelError(getApiErrorMessage(error, "Unable to load conversation messages right now."));
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
  }, [selectedRoom?.id, selectedRoom?.is_member]);

  async function loadOlderMessages() {
    if (!selectedRoom || !nextBeforeSequence || isLoadingOlderMessages) {
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
        selectedRoom.id,
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
      setPanelError(getApiErrorMessage(error, "Unable to load older messages right now."));
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

  function resetComposerState() {
    setComposeText("");
    setReplyTarget(null);
    setEditingMessageId(null);
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsSubmittingInvite(true);

    try {
      await inviteToRoom(selectedRoom.id, {
        username: inviteUsername,
        message: inviteMessage.trim() ? inviteMessage : undefined,
      });
      setInviteUsername("");
      setInviteMessage("");
      setPanelNotice(`Invitation sent to ${inviteUsername}.`);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to send that invitation right now."));
    } finally {
      setIsSubmittingInvite(false);
    }
  }

  async function handleLeaveRoom() {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsLeavingRoom(true);

    try {
      await leaveRoom(selectedRoom.id);
      setPanelNotice(`You left #${selectedRoom.name}.`);
      resetComposerState();
      setMessages([]);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to leave that room right now."));
    } finally {
      setIsLeavingRoom(false);
    }
  }

  async function handleJoinFromRoomView() {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsJoiningRoom(true);

    try {
      await joinRoom(selectedRoom.id);
      setPanelNotice(`You joined #${selectedRoom.name}.`);
      await refreshRooms();
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to join that room right now."));
    } finally {
      setIsJoiningRoom(false);
    }
  }

  async function handleRemoveMember(member: RoomMember) {
    if (!selectedRoom) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setRemovingMemberId(member.id);

    try {
      const response = await roomsApi.removeMember(selectedRoom.id, member.id);
      setPanelNotice(response.message);
      await refreshRooms();

      const [memberResponse, banResponse] = await Promise.all([
        roomsApi.listMembers(selectedRoom.id),
        selectedRoom.can_manage_members
          ? roomsApi.listBans(selectedRoom.id)
          : Promise.resolve({ bans: [] }),
      ]);

      setMembers(memberResponse.members);
      setBans(banResponse.bans);
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to remove that member right now."));
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRoom || !composeText.trim()) {
      return;
    }

    setPanelError(null);
    setPanelNotice(null);
    setIsSubmittingMessage(true);

    try {
      if (editingMessageId !== null) {
        const updatedMessage = await messagesApi.edit(editingMessageId, {
          body_text: composeText,
        });
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === updatedMessage.id ? updatedMessage : message,
          ),
        );
        setPanelNotice("Message updated.");
      } else {
        shouldAutoScrollRef.current = isNearBottom();
        const createdMessage = await messagesApi.create(selectedRoom.id, {
          body_text: composeText,
          reply_to_message_id: replyTarget?.id,
        });
        setMessages((currentMessages) => [...currentMessages, createdMessage]);
        setSequenceHead(createdMessage.sequence_number);
      }

      resetComposerState();
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to save that message right now."));
    } finally {
      setIsSubmittingMessage(false);
    }
  }

  function handleReply(message: ConversationMessage) {
    setEditingMessageId(null);
    setReplyTarget(message);
    setComposeText("");
    setPanelError(null);
    setPanelNotice(null);
  }

  function handleEdit(message: ConversationMessage) {
    setReplyTarget(null);
    setEditingMessageId(message.id);
    setComposeText(message.body_text ?? "");
    setPanelError(null);
    setPanelNotice(null);
  }

  async function handleDelete(message: ConversationMessage) {
    setPanelError(null);
    setPanelNotice(null);
    setUpdatingMessageId(message.id);

    try {
      const deletedMessage = await messagesApi.delete(message.id);
      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) =>
          currentMessage.id === deletedMessage.id ? deletedMessage : currentMessage,
        ),
      );

      if (editingMessageId === message.id || replyTarget?.id === message.id) {
        resetComposerState();
      }
    } catch (error) {
      setPanelError(getApiErrorMessage(error, "Unable to delete that message right now."));
    } finally {
      setUpdatingMessageId(null);
    }
  }

  if (!selectedRoom) {
    return (
      <section className="chat-workspace card">
        <header className="chat-header">
          <p className="eyebrow">Workspace</p>
          <h1>Choose a room</h1>
          <p>
            Create your first room, join a public room from the sidebar, or accept a private-room
            invitation to begin the conversation flow.
          </p>
        </header>

        <div className="feature-list">
          <li>Public rooms can be discovered, searched, and joined directly from the sidebar.</li>
          <li>Private rooms stay hidden from the public catalog and grow through invitations.</li>
          <li>
            Once you have rooms, this panel becomes the message workspace for history, composer,
            replies, and attachments.
          </li>
        </div>
      </section>
    );
  }

  if (!selectedRoom.is_member) {
    if (selectedRoom.is_banned) {
      return (
        <section className="chat-workspace card">
          <header className="chat-header">
            <p className="eyebrow">Workspace</p>
            <h1>Room access changed</h1>
            <p>
              This account no longer has access to the previously selected room. Choose another
              room from the sidebar to continue.
            </p>
          </header>

          {panelError ? <p className="auth-error">{panelError}</p> : null}
          {panelNotice ? <p className="auth-success">{panelNotice}</p> : null}

          <div className="feature-list">
            <li>Removed or banned users no longer see the conversation workspace.</li>
            <li>Public room discovery still works for rooms you can actually join.</li>
            <li>Private room access remains invitation and membership driven.</li>
          </div>
        </section>
      );
    }

    return (
      <section className="chat-workspace card">
        <header className="chat-header room-header">
          <div>
            <p className="eyebrow">Room preview</p>
            <h1>#{selectedRoom.name}</h1>
            <p>
              {selectedRoom.description ??
                "Join this room to unlock the conversation workspace, history, and future attachment access."}
            </p>
          </div>

          <div className="room-header-actions">
            <span className="status-pill status-pill--neutral">{selectedRoom.visibility}</span>
            <span className="status-pill status-pill--neutral">
              {selectedRoom.member_count} member{selectedRoom.member_count === 1 ? "" : "s"}
            </span>
          </div>
        </header>

        {panelError ? <p className="auth-error">{panelError}</p> : null}
        {panelNotice ? <p className="auth-success">{panelNotice}</p> : null}

        <article className="session-card">
          <p className="session-card-kicker">Access</p>
          <h2>{selectedRoom.is_banned ? "Access revoked" : "Join required"}</h2>
          <p>
            {selectedRoom.is_banned
              ? "This account no longer has access to the room. Membership now determines who can open the conversation workspace."
              : "Membership now controls conversation visibility. Join the room before message history and attachments become available."}
          </p>
          {selectedRoom.can_join ? (
            <button
              className="primary-button"
              type="button"
              disabled={isJoiningRoom}
              onClick={() => {
                void handleJoinFromRoomView();
              }}
            >
              {isJoiningRoom ? "Joining..." : "Join room"}
            </button>
          ) : null}
        </article>
      </section>
    );
  }

  return (
    <section className="chat-workspace card">
      <header className="chat-header room-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>#{selectedRoom.name}</h1>
          <p>
            {selectedRoom.description ??
              "Room conversation is now backed by real persisted messages, edits, deletes, and reply references."}
          </p>
        </div>

        <div className="room-header-actions">
          <span className="status-pill status-pill--neutral">{selectedRoom.visibility}</span>
          <span className="status-pill status-pill--neutral">
            {selectedRoom.member_count} member{selectedRoom.member_count === 1 ? "" : "s"}
          </span>
          <span className="status-pill status-pill--neutral">sequence {sequenceHead}</span>
          {selectedRoom.can_leave ? (
            <button
              className="ghost-button"
              type="button"
              disabled={isLeavingRoom}
              onClick={() => {
                void handleLeaveRoom();
              }}
            >
              {isLeavingRoom ? "Leaving..." : "Leave room"}
            </button>
          ) : null}
        </div>
      </header>

      {panelError ? <p className="auth-error">{panelError}</p> : null}
      {panelNotice ? <p className="auth-success">{panelNotice}</p> : null}

      <div className="chat-room-layout">
        <div className="chat-room-main">
          {isLoadingMessages ? (
            <p>Loading messages...</p>
          ) : messages.length === 0 ? (
            <div className="feature-list">
              <li>This room has no messages yet.</li>
              <li>Send the first message, reply to it, and edit or delete it from the message list.</li>
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
                    {isLoadingOlderMessages ? "Loading older messages..." : "Load older messages"}
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
                  <p className={message.is_deleted ? "message-body message-body--deleted" : "message-body"}>
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
                    : "Room messages now persist with replies, edits, deletes, and continuity sequence numbers."}
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
                placeholder="Write a message"
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
        </div>

        <aside className="room-context-rail">
          <article className="session-card">
            <p className="session-card-kicker">Room details</p>
            <h2>Context</h2>
            <dl className="session-meta room-context-meta">
              <div>
                <dt>Visibility</dt>
                <dd>{selectedRoom.visibility}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{selectedRoom.can_manage_members ? "Admin" : "Member"}</dd>
              </div>
              <div>
                <dt>Members</dt>
                <dd>{selectedRoom.member_count}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{selectedRoom.is_owner ? "Owner" : "Joined"}</dd>
              </div>
            </dl>
          </article>

          {selectedRoom.visibility === "private" && selectedRoom.can_manage_members ? (
            <article className="session-card">
              <p className="session-card-kicker">Invitations</p>
              <h2>Invite to this private room</h2>
              <form className="auth-form" onSubmit={handleInvite}>
                <label>
                  <span>Username</span>
                  <input
                    type="text"
                    placeholder="alice"
                    value={inviteUsername}
                    onChange={(event) => setInviteUsername(event.target.value)}
                    minLength={3}
                    maxLength={64}
                    required
                  />
                </label>
                <label>
                  <span>Message</span>
                  <input
                    type="text"
                    placeholder="Optional invitation note"
                    value={inviteMessage}
                    onChange={(event) => setInviteMessage(event.target.value)}
                    maxLength={500}
                  />
                </label>
                <button className="primary-button" type="submit" disabled={isSubmittingInvite}>
                  {isSubmittingInvite ? "Sending invitation..." : "Invite user"}
                </button>
              </form>
            </article>
          ) : null}

          <article className="session-card room-people-card">
            <div className="room-context-card-header">
              <div>
                <p className="session-card-kicker">Members</p>
                <h2>Room members</h2>
              </div>
              <span className="sidebar-muted">{members.length}</span>
            </div>
            {isLoadingPeople ? (
              <p>Loading room members...</p>
            ) : (
              <ul className="room-people-list room-people-list--scrollable">
                {members.map((member) => (
                  <li key={member.id} className="room-people-item">
                    <div>
                      <strong>{member.username}</strong>
                      <small>
                        {member.is_owner ? "Owner" : member.is_admin ? "Admin" : "Member"}
                      </small>
                    </div>
                    {member.can_remove ? (
                      <button
                        className="ghost-button sidebar-action-button"
                        type="button"
                        disabled={removingMemberId === member.id}
                        onClick={() => {
                          void handleRemoveMember(member);
                        }}
                      >
                        {removingMemberId === member.id ? "Removing..." : "Remove"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </article>

          {selectedRoom.can_manage_members ? (
            <article className="session-card room-people-card">
              <div className="room-context-card-header">
                <div>
                  <p className="session-card-kicker">Moderation</p>
                  <h2>Banned users</h2>
                </div>
                <span className="sidebar-muted">{bans.length}</span>
              </div>
              {isLoadingPeople ? (
                <p>Loading moderation state...</p>
              ) : bans.length === 0 ? (
                <p>No banned users in this room right now.</p>
              ) : (
                <ul className="room-people-list room-people-list--scrollable">
                  {bans.map((ban) => (
                    <li key={ban.id} className="room-people-item">
                      <div>
                        <strong>{ban.username}</strong>
                        <small>{ban.reason ?? "Removed by a room admin."}</small>
                      </div>
                      <span className="sidebar-muted">
                        {ban.banned_by_username ? `By ${ban.banned_by_username}` : "Admin action"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
