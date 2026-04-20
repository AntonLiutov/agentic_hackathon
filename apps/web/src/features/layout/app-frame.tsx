import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { getApiErrorMessage } from "../../shared/api/client";
import type { PresenceStatus } from "../../shared/api/presence";
import { useInboxRealtime } from "../../shared/realtime/useInboxRealtime";
import { usePresenceHeartbeat } from "../../shared/realtime/usePresenceHeartbeat";
import { useDirectMessages } from "../direct-messages/use-direct-messages";
import { useFriends } from "../friends/use-friends";
import { usePresence } from "../presence/use-presence";
import { useRooms } from "../rooms/use-rooms";
import { useSession } from "../session/use-session";

type SidebarSectionKey = "public" | "private" | "directMessages" | "invitations";

function formatSidebarPresenceLabel(presenceStatus: PresenceStatus) {
  return presenceStatus === "afk" ? "AFK" : presenceStatus;
}

export function AppFrame() {
  return <AppFrameLayout />;
}

function AppFrameLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearSession, user, signOut } = useSession();
  const { getPresence, setPresence } = usePresence();
  const { pendingIncomingCount, refreshFriendships } = useFriends();
  const {
    acceptInvitation,
    clearMessages,
    createRoom,
    errorMessage,
    invitations,
    isLoading,
    myRooms,
    noticeMessage,
    publicRooms,
    incrementUnread: incrementRoomUnread,
    refreshRooms,
    searchTerm,
    selectRoom,
    selectedRoomId,
    setSearchTerm,
  } = useRooms();
  const {
    directMessages,
    incrementUnread: incrementDirectMessageUnread,
    refreshDirectMessages,
    selectDirectMessage,
    selectedDirectMessageId,
    totalUnreadCount: totalDirectMessageUnreadCount,
  } = useDirectMessages();

  const visiblePublicRooms = publicRooms.filter((room) => !room.is_banned);
  const privateRooms = myRooms.filter((room) => room.visibility === "private");
  const contactsBadgeCount =
    totalDirectMessageUnreadCount > 0 ? totalDirectMessageUnreadCount : pendingIncomingCount;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");
  const [newRoomVisibility, setNewRoomVisibility] = useState<"public" | "private">("public");
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<SidebarSectionKey, boolean>>({
    public: false,
    private: false,
    directMessages: false,
    invitations: false,
  });
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const handleUnreadEvent = useCallback(
    (conversationId: string) => {
      const isActiveRoom =
        location.pathname.startsWith("/app/chats") && selectedRoomId === conversationId;
      const isActiveDirectMessage =
        location.pathname.startsWith("/app/contacts") &&
        selectedDirectMessageId === conversationId;
      const hasDirectMessage = directMessages.some(
        (directMessage) => directMessage.id === conversationId,
      );

      if (!isActiveRoom) {
        incrementRoomUnread(conversationId);
      }

      if (!isActiveDirectMessage) {
        incrementDirectMessageUnread(conversationId);
      }

      if (!isActiveDirectMessage && !hasDirectMessage) {
        void refreshDirectMessages();
      }
    },
    [
      directMessages,
      incrementDirectMessageUnread,
      incrementRoomUnread,
      location.pathname,
      refreshDirectMessages,
      selectedDirectMessageId,
      selectedRoomId,
    ],
  );

  const handleInboxConnected = useCallback(() => {
    void refreshRooms();
    void refreshDirectMessages();
    void refreshFriendships();
  }, [refreshDirectMessages, refreshFriendships, refreshRooms]);

  const handlePresenceEvent = useCallback(
    (userId: string, presenceStatus: PresenceStatus) => {
      setPresence(userId, presenceStatus);
    },
    [setPresence],
  );

  const handleFriendshipsChanged = useCallback(() => {
    void refreshDirectMessages();
    void refreshFriendships();
  }, [refreshDirectMessages, refreshFriendships]);

  const handleRoomsChanged = useCallback(() => {
    void refreshRooms().finally(() => {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("agentic:rooms-updated"));
      }, 0);
    });
  }, [refreshRooms]);

  const handleAccountDeleted = useCallback(() => {
    window.sessionStorage.setItem("agentic_notice", "Account deleted permanently.");
    clearSession();
    navigate("/signin?notice=account-deleted", { replace: true });
  }, [clearSession, navigate]);

  useInboxRealtime({
    enabled: Boolean(user),
    onUnread: handleUnreadEvent,
    onPresence: handlePresenceEvent,
    onFriendshipsChanged: handleFriendshipsChanged,
    onRoomsChanged: handleRoomsChanged,
    onAccountDeleted: handleAccountDeleted,
    onConnected: handleInboxConnected,
  });

  usePresenceHeartbeat({
    enabled: Boolean(user),
    onHeartbeat: useCallback(
      (presenceStatus: PresenceStatus) => {
        if (!user) {
          return;
        }

        setPresence(user.id, presenceStatus);
      },
      [setPresence, user],
    ),
  });

  async function handleCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSidebarError(null);
    setIsSubmittingRoom(true);

    try {
      await createRoom({
        name: newRoomName,
        description: newRoomDescription.trim() ? newRoomDescription.trim() : undefined,
        visibility: newRoomVisibility,
      });
      setNewRoomName("");
      setNewRoomDescription("");
      setNewRoomVisibility("public");
      setIsCreateOpen(false);
    } catch (error) {
      setSidebarError(getApiErrorMessage(error, "Unable to create the room right now."));
    } finally {
      setIsSubmittingRoom(false);
    }
  }

  async function handleAcceptInvitation(invitationId: string) {
    setSidebarError(null);
    setAcceptingInvitationId(invitationId);

    try {
      await acceptInvitation(invitationId);
    } catch (error) {
      setSidebarError(getApiErrorMessage(error, "Unable to accept the invitation right now."));
    } finally {
      setAcceptingInvitationId(null);
    }
  }

  function navigateToRoom(roomId: string) {
    selectRoom(roomId);
    navigate("/app/chats");
  }

  function navigateToDirectMessage(directMessageId: string) {
    selectDirectMessage(directMessageId);
    navigate("/app/contacts");
  }

  function toggleSidebarSection(sectionKey: SidebarSectionKey) {
    setCollapsedSections((currentState) => ({
      ...currentState,
      [sectionKey]: !currentState[sectionKey],
    }));
  }

  const isChatsRoute = location.pathname.startsWith("/app/chats");
  const isContactsRoute = location.pathname.startsWith("/app/contacts");
  const workspaceGridClass = isChatsRoute || isContactsRoute
    ? "workspace-grid workspace-grid--chat"
    : "workspace-grid workspace-grid--wide";

  return (
    <div className="workspace-page">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">AC</div>
          <p className="brand-tagline">Team chat for rooms, direct messages, and files</p>
        </div>

        <div className="topbar-actions">
          <div className="topbar-user-menu" ref={userMenuRef}>
            <button
              className="ghost-button topbar-user-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
              onClick={() => {
                setIsUserMenuOpen((currentValue) => !currentValue);
              }}
            >
              <span>{user?.name ?? user?.username}</span>
              <span aria-hidden="true">▾</span>
            </button>
            {isUserMenuOpen ? (
              <div className="topbar-user-dropdown" role="menu" aria-label="User menu">
                <NavLink
                  className="topbar-user-dropdown-link"
                  role="menuitem"
                  to="/app/profile"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  Profile
                </NavLink>
                <NavLink
                  className="topbar-user-dropdown-link"
                  role="menuitem"
                  to="/app/sessions"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  Sessions
                </NavLink>
                <button
                  className="topbar-user-dropdown-link"
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    void signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className={workspaceGridClass}>
        <aside className="workspace-sidebar">
          <label className="sidebar-search">
            <span>Search rooms</span>
            <input
              type="search"
              placeholder="Search rooms, contacts"
              value={searchTerm}
              onChange={(event) => {
                clearMessages();
                setSearchTerm(event.target.value);
              }}
            />
          </label>

          <div className="sidebar-toolbar">
            <button
              className="ghost-button sidebar-create-button"
              type="button"
              onClick={() => {
                setIsCreateOpen((currentValue) => !currentValue);
                setSidebarError(null);
              }}
            >
              {isCreateOpen ? "Close" : "Create room"}
            </button>
            <NavLink
              to="/app/contacts"
              className={({ isActive }) =>
                isActive
                  ? "ghost-button sidebar-create-button sidebar-nav-link is-active"
                  : "ghost-button sidebar-create-button sidebar-nav-link"
              }
              onClick={() => {
                selectDirectMessage(null);
              }}
            >
              <span>Contacts</span>
              {contactsBadgeCount > 0 ? <span className="sidebar-badge">{contactsBadgeCount}</span> : null}
            </NavLink>
          </div>

          {isCreateOpen ? (
            <form className="compact-form compact-form--sidebar" onSubmit={handleCreateRoom}>
              <label>
                <span>Name</span>
                <input
                  type="text"
                  placeholder="engineering-room"
                  value={newRoomName}
                  onChange={(event) => setNewRoomName(event.target.value)}
                  minLength={3}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                <span>Description</span>
                <input
                  type="text"
                  placeholder="Short room description"
                  value={newRoomDescription}
                  onChange={(event) => setNewRoomDescription(event.target.value)}
                  maxLength={500}
                />
              </label>
              <label>
                <span>Visibility</span>
                <select
                  value={newRoomVisibility}
                  onChange={(event) =>
                    setNewRoomVisibility(event.target.value as "public" | "private")
                  }
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </label>
              <button
                className="primary-button compact-submit"
                type="submit"
                disabled={isSubmittingRoom}
              >
                {isSubmittingRoom ? "Creating..." : "Create room"}
              </button>
            </form>
          ) : null}

          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          {noticeMessage ? <p className="auth-success">{noticeMessage}</p> : null}
          {sidebarError ? <p className="auth-error">{sidebarError}</p> : null}

          <section className="sidebar-section">
            <button
              type="button"
              className="sidebar-heading sidebar-heading--toggle"
              aria-expanded={!collapsedSections.public}
              onClick={() => toggleSidebarSection("public")}
            >
              <span className="sidebar-heading-label">
                <span className="sidebar-heading-caret" aria-hidden="true">
                  {collapsedSections.public ? ">" : "v"}
                </span>
                <span>Public Rooms</span>
              </span>
            </button>
            {!collapsedSections.public ? (
              isLoading ? (
                <p className="sidebar-empty">Loading public rooms...</p>
              ) : visiblePublicRooms.length > 0 ? (
                <ul className="sidebar-room-list">
                  {visiblePublicRooms.map((room) => (
                    <li key={room.id}>
                      <button
                        type="button"
                        className={
                          selectedRoomId === room.id
                            ? "sidebar-room-button is-active"
                            : "sidebar-room-button"
                        }
                        onClick={() => navigateToRoom(room.id)}
                        title={room.name}
                      >
                        <span className="sidebar-room-label">
                          <span className="sidebar-room-primary">#{room.name}</span>
                        </span>
                        {room.unread_count > 0 ? (
                          <span className="sidebar-badge">{room.unread_count}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null
            ) : null}
          </section>

          <section className="sidebar-section">
            <button
              type="button"
              className="sidebar-heading sidebar-heading--toggle"
              aria-expanded={!collapsedSections.private}
              onClick={() => toggleSidebarSection("private")}
            >
              <span className="sidebar-heading-label">
                <span className="sidebar-heading-caret" aria-hidden="true">
                  {collapsedSections.private ? ">" : "v"}
                </span>
                <span>Private Rooms</span>
              </span>
            </button>
            {!collapsedSections.private ? (
              privateRooms.length > 0 ? (
                <ul className="sidebar-room-list">
                  {privateRooms.map((room) => (
                    <li key={room.id}>
                      <button
                        type="button"
                        className={
                          selectedRoomId === room.id
                            ? "sidebar-room-button is-active"
                            : "sidebar-room-button"
                        }
                        onClick={() => navigateToRoom(room.id)}
                        title={room.name}
                      >
                        <span className="sidebar-room-label">
                          <span className="sidebar-room-lock" aria-hidden="true">
                            🔒
                          </span>
                          <span className="sidebar-room-primary">#{room.name}</span>
                        </span>
                        {room.unread_count > 0 ? (
                          <span className="sidebar-badge">{room.unread_count}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null
            ) : null}
          </section>

          <section className="sidebar-section">
            <button
              type="button"
              className="sidebar-heading sidebar-heading--toggle"
              aria-expanded={!collapsedSections.directMessages}
              onClick={() => toggleSidebarSection("directMessages")}
            >
              <span className="sidebar-heading-label">
                <span className="sidebar-heading-caret" aria-hidden="true">
                  {collapsedSections.directMessages ? ">" : "v"}
                </span>
                <span>Direct Messages</span>
              </span>
            </button>
            {!collapsedSections.directMessages ? (
              directMessages.length > 0 ? (
                <ul className="sidebar-room-list">
                  {directMessages.map((directMessage) => {
                    const presenceStatus =
                      getPresence(directMessage.counterpart_user_id) ??
                      directMessage.counterpart_presence_status ??
                      "offline";
                    const presenceLabel = formatSidebarPresenceLabel(presenceStatus);

                    return (
                      <li key={directMessage.id}>
                        <button
                          type="button"
                          className={
                            selectedDirectMessageId === directMessage.id
                              ? "sidebar-room-button is-active"
                              : "sidebar-room-button"
                          }
                          onClick={() => navigateToDirectMessage(directMessage.id)}
                          title={`${directMessage.counterpart_username} (${presenceLabel})`}
                        >
                          <span className="sidebar-room-label">
                            <span
                              className={`presence-dot presence-dot--${presenceStatus} sidebar-room-presence`}
                              aria-hidden="true"
                            />
                            <span className="sidebar-room-primary">
                              {directMessage.counterpart_username}
                            </span>
                          </span>
                          {directMessage.unread_count > 0 ? (
                            <span className="sidebar-badge">{directMessage.unread_count}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null
            ) : null}
          </section>

          <section className="sidebar-section">
            <button
              type="button"
              className="sidebar-heading sidebar-heading--toggle"
              aria-expanded={!collapsedSections.invitations}
              onClick={() => toggleSidebarSection("invitations")}
            >
              <span className="sidebar-heading-label">
                <span className="sidebar-heading-caret" aria-hidden="true">
                  {collapsedSections.invitations ? ">" : "v"}
                </span>
                <span>Invitations</span>
              </span>
            </button>
            {!collapsedSections.invitations ? (
              invitations.length > 0 ? (
                <ul className="sidebar-room-list">
                  {invitations.map((invitation) => (
                    <li key={invitation.id} className="sidebar-room-item">
                      <button
                        type="button"
                        className="sidebar-room-button"
                        onClick={() => navigateToRoom(invitation.room_conversation_id)}
                        title={
                          invitation.inviter_username
                            ? `${invitation.room_name} invited by ${invitation.inviter_username}`
                            : invitation.room_name
                        }
                      >
                        <span className="sidebar-room-label">
                          <span className="sidebar-room-primary">#{invitation.room_name}</span>
                        </span>
                      </button>
                      <button
                        className="ghost-button sidebar-action-button"
                        type="button"
                        disabled={acceptingInvitationId === invitation.id}
                        onClick={() => {
                          void handleAcceptInvitation(invitation.id);
                        }}
                      >
                        {acceptingInvitationId === invitation.id ? "Joining..." : "Accept"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null
            ) : null}
          </section>
        </aside>

        <main className="workspace-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
