import { type FormEvent, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useRooms } from "../rooms/use-rooms";
import { useSession } from "../session/use-session";
import { getApiErrorMessage } from "../../shared/api/client";

const appNavItems = [
  { to: "/app/chats", label: "Chats" },
  { to: "/app/contacts", label: "Contacts" },
  { to: "/app/sessions", label: "Sessions" },
  { to: "/app/profile", label: "Profile" },
];

function WorkspaceContextCard() {
  const location = useLocation();
  const { invitations, selectedRoom } = useRooms();

  const heading = location.pathname.startsWith("/app/chats")
    ? selectedRoom
      ? `#${selectedRoom.name}`
      : "Room info"
    : location.pathname.startsWith("/app/contacts")
      ? "Contacts panel"
      : location.pathname.startsWith("/app/sessions")
        ? "Session details"
        : "Profile summary";

  return (
    <aside className="workspace-context">
      <h3>{heading}</h3>

      {location.pathname.startsWith("/app/chats") && selectedRoom ? (
        <>
          <p>{selectedRoom.description ?? "No room description yet."}</p>

          <div className="context-block">
            <strong>Room details</strong>
            <ul>
              <li>
                <span>Visibility</span>
                <small>{selectedRoom.visibility}</small>
              </li>
              <li>
                <span>Members</span>
                <small>{selectedRoom.member_count}</small>
              </li>
              <li>
                <span>Membership</span>
                <small>{selectedRoom.is_member ? "Joined" : "Not joined"}</small>
              </li>
              <li>
                <span>Owner controls</span>
                <small>{selectedRoom.is_owner ? "Enabled" : "Viewer"}</small>
              </li>
            </ul>
          </div>

          {selectedRoom.visibility === "private" ? (
            <div className="context-block">
              <strong>Private-room notes</strong>
              <p>
                Private rooms stay out of the public catalog. Membership grows through invitation
                acceptance, not open join.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p>
            This panel is the reserved space for room metadata, member status, session management,
            and profile controls as the product grows.
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
        </>
      )}
    </aside>
  );
}

export function AppFrame() {
  const { user, signOut } = useSession();
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
    searchTerm,
    selectRoom,
    selectedRoomId,
    setSearchTerm,
  } = useRooms();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");
  const [newRoomVisibility, setNewRoomVisibility] = useState<"public" | "private">("public");
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<string | null>(null);

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

      <div className="workspace-grid">
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
                      onClick={() => selectRoom(room.id)}
                    >
                      <span>#{room.name}</span>
                      <small>
                        {room.visibility} • {room.member_count}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sidebar-section">
            <div className="sidebar-heading">
              <h3>Public Rooms</h3>
              <small>{publicRooms.length} found</small>
            </div>
            {isLoading ? (
              <p className="sidebar-empty">Loading public rooms...</p>
            ) : publicRooms.length === 0 ? (
              <p className="sidebar-empty">No public rooms match this search right now.</p>
            ) : (
              <ul className="sidebar-room-list">
                {publicRooms.map((room) => (
                  <li key={room.id} className="sidebar-room-item">
                    <button
                      type="button"
                      className={
                        selectedRoomId === room.id ? "sidebar-room-button is-active" : "sidebar-room-button"
                      }
                      onClick={() => selectRoom(room.id)}
                    >
                      <span>#{room.name}</span>
                      <small>{room.member_count} members</small>
                    </button>
                    {room.is_member ? (
                      <button
                        className="ghost-button sidebar-action-button"
                        type="button"
                        onClick={() => selectRoom(room.id)}
                      >
                        Open
                      </button>
                    ) : room.is_banned ? (
                      <span className="sidebar-muted">Access revoked</span>
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
                      onClick={() => selectRoom(invitation.room_conversation_id)}
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
