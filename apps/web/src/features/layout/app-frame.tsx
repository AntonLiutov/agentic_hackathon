import { type FormEvent, useCallback, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useDirectMessages } from "../direct-messages/use-direct-messages";
import { useFriends } from "../friends/use-friends";
import { usePresence } from "../presence/use-presence";
import { useRooms } from "../rooms/use-rooms";
import { useSession } from "../session/use-session";
import { getApiErrorMessage } from "../../shared/api/client";
import type { PresenceStatus } from "../../shared/api/presence";
import { useInboxRealtime } from "../../shared/realtime/useInboxRealtime";
import { usePresenceHeartbeat } from "../../shared/realtime/usePresenceHeartbeat";
import {
  useWorkspaceContextPanel,
  WorkspaceContextPanelProvider,
} from "./workspace-context-panel";

const appNavItems = [
  { to: "/app/chats", label: "Chats" },
  { to: "/app/contacts", label: "Contacts" },
  { to: "/app/sessions", label: "Sessions" },
  { to: "/app/profile", label: "Profile" },
];

function WorkspaceContextCard() {
  const location = useLocation();
  const { invitations } = useRooms();
  const { panelContent } = useWorkspaceContextPanel();

  if (location.pathname.startsWith("/app/chats")) {
    return null;
  }

  if (location.pathname.startsWith("/app/contacts")) {
    return <aside className="workspace-context">{panelContent}</aside>;
  }

  const heading = location.pathname.startsWith("/app/sessions")
    ? "Session details"
    : "Profile summary";

  return (
    <aside className="workspace-context">
      <h3>{heading}</h3>
      <p>
        This panel is the reserved space for contacts, sessions, and profile controls as the
        product grows.
      </p>

      <div className="context-block">
        <strong>Pending invitations</strong>
        {invitations.length === 0 ? (
          <p>No private-room invitations waiting right now.</p>
        ) : (
          <ul>
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <span>#{invitation.room_name}</span>
                <small>{invitation.inviter_username ?? "Unknown inviter"}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

export function AppFrame() {
  return (
    <WorkspaceContextPanelProvider>
      <AppFrameLayout />
    </WorkspaceContextPanelProvider>
  );
}

function AppFrameLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useSession();
  const { setPresence } = usePresence();
  const { pendingIncomingCount, refreshFriendships } = useFriends();
  const {
    acceptInvitation,
    clearMessages,
    createRoom,
    errorMessage,
    invitations,
    isLoading,
    joinRoom,
    myRooms,
    noticeMessage,
    publicRooms,
    incrementUnread: incrementRoomUnread,
    refreshRooms,
    searchTerm,
    selectRoom,
    selectedRoomId,
    setSearchTerm,
    totalUnreadCount: totalRoomUnreadCount,
  } = useRooms();
  const {
    directMessages,
    incrementUnread: incrementDirectMessageUnread,
    refreshDirectMessages,
    selectedDirectMessageId,
    totalUnreadCount: totalDirectMessageUnreadCount,
  } = useDirectMessages();
  const visiblePublicRooms = publicRooms.filter((room) => !room.is_banned);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");
  const [newRoomVisibility, setNewRoomVisibility] = useState<"public" | "private">("public");
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<string | null>(null);

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

  useInboxRealtime({
    enabled: Boolean(user),
    onUnread: handleUnreadEvent,
    onPresence: handlePresenceEvent,
    onFriendshipsChanged: handleFriendshipsChanged,
    onRoomsChanged: handleRoomsChanged,
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

  async function handleJoinRoom(roomId: string) {
    setSidebarError(null);
    setJoiningRoomId(roomId);

    try {
      await joinRoom(roomId);
    } catch (error) {
      setSidebarError(getApiErrorMessage(error, "Unable to join that room right now."));
    } finally {
      setJoiningRoomId(null);
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

  return (
    <div className="workspace-page">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">AC</div>
          <div>
            <strong>Agentic Chat</strong>
            <p>Classic web chat foundation</p>
          </div>
        </div>

        <nav className="topbar-nav" aria-label="Primary">
          {appNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "topbar-link is-active" : "topbar-link")}
            >
              {item.label}
              {item.to === "/app/chats" && totalRoomUnreadCount > 0 ? (
                <span className="sidebar-badge">{totalRoomUnreadCount}</span>
              ) : null}
              {item.to === "/app/contacts" && totalDirectMessageUnreadCount > 0 ? (
                <span className="sidebar-badge">{totalDirectMessageUnreadCount}</span>
              ) : null}
              {item.to === "/app/contacts" &&
              totalDirectMessageUnreadCount === 0 &&
              pendingIncomingCount > 0 ? (
                <span className="sidebar-badge">{pendingIncomingCount}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="signed-in-user">
            <span>{user?.name}</span>
            <small>{user?.email}</small>
          </div>
          <button
            className="ghost-button"
            onClick={() => {
              void signOut();
            }}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      <div
        className={
          location.pathname.startsWith("/app/chats")
            ? "workspace-grid workspace-grid--chat"
            : "workspace-grid"
        }
      >
        <aside className="workspace-sidebar">
          <label className="sidebar-search">
            <span>Search public rooms</span>
            <input
              type="search"
              placeholder="Search by room name or description"
              value={searchTerm}
              onChange={(event) => {
                clearMessages();
                setSearchTerm(event.target.value);
              }}
            />
          </label>

          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          {noticeMessage ? <p className="auth-success">{noticeMessage}</p> : null}
          {sidebarError ? <p className="auth-error">{sidebarError}</p> : null}

          <section className="sidebar-section">
            <div className="sidebar-heading">
              <h3>Your Rooms</h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen((currentValue) => !currentValue);
                  setSidebarError(null);
                }}
              >
                {isCreateOpen ? "Close" : "Create"}
              </button>
            </div>

            {isCreateOpen ? (
              <form className="compact-form" onSubmit={handleCreateRoom}>
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
                <button className="primary-button compact-submit" type="submit" disabled={isSubmittingRoom}>
                  {isSubmittingRoom ? "Creating..." : "Create room"}
                </button>
              </form>
            ) : null}

            {myRooms.length === 0 ? (
              <p className="sidebar-empty">No rooms yet. Create one or join a public room.</p>
            ) : (
              <ul className="sidebar-room-list">
                {myRooms.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      className={
                        selectedRoomId === room.id ? "sidebar-room-button is-active" : "sidebar-room-button"
                      }
                      onClick={() => navigateToRoom(room.id)}
                    >
                      <span>#{room.name}</span>
                      <small>{room.visibility} | {room.member_count}</small>
                      {room.unread_count > 0 ? (
                        <span className="sidebar-badge">{room.unread_count}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sidebar-section">
            <div className="sidebar-heading">
              <h3>Public Rooms</h3>
              <small>{visiblePublicRooms.length} found</small>
            </div>
            {isLoading ? (
              <p className="sidebar-empty">Loading public rooms...</p>
            ) : visiblePublicRooms.length === 0 ? (
              <p className="sidebar-empty">No public rooms match this search right now.</p>
            ) : (
              <ul className="sidebar-room-list">
                {visiblePublicRooms.map((room) => (
                  <li key={room.id} className="sidebar-room-item">
                    <button
                      type="button"
                      className={
                        selectedRoomId === room.id ? "sidebar-room-button is-active" : "sidebar-room-button"
                      }
                      onClick={() => navigateToRoom(room.id)}
                    >
                      <span>#{room.name}</span>
                      <small>{room.member_count} members</small>
                      {room.unread_count > 0 ? (
                        <span className="sidebar-badge">{room.unread_count}</span>
                      ) : null}
                    </button>
                    {room.is_member ? (
                      <button
                        className="ghost-button sidebar-action-button"
                        type="button"
                        onClick={() => navigateToRoom(room.id)}
                      >
                        Open
                      </button>
                    ) : (
                      <button
                        className="ghost-button sidebar-action-button"
                        type="button"
                        disabled={joiningRoomId === room.id || !room.can_join}
                        onClick={() => {
                          void handleJoinRoom(room.id);
                        }}
                      >
                        {joiningRoomId === room.id ? "Joining..." : "Join"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sidebar-section">
            <div className="sidebar-heading">
              <h3>Invitations</h3>
              <small>{invitations.length} pending</small>
            </div>
            {invitations.length === 0 ? (
              <p className="sidebar-empty">No private-room invitations are waiting for you.</p>
            ) : (
              <ul className="sidebar-room-list">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="sidebar-room-item">
                    <button
                      type="button"
                      className="sidebar-room-button"
                      onClick={() => navigateToRoom(invitation.room_conversation_id)}
                    >
                      <span>#{invitation.room_name}</span>
                      <small>{invitation.inviter_username ?? "Unknown inviter"}</small>
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
            )}
          </section>
        </aside>

        <main className="workspace-main">
          <Outlet />
        </main>

        <WorkspaceContextCard />
      </div>
    </div>
  );
}
