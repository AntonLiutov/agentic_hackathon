import { type FormEvent, useEffect, useState } from "react";

import { useRooms } from "../../features/rooms/use-rooms";
import { ApiError, getApiErrorMessage } from "../../shared/api/client";
import { roomsApi, type RoomBan, type RoomMember } from "../../shared/api/rooms";

const sampleMessages = [
  { author: "Bob", time: "10:21", body: "Hello team" },
  { author: "Alice", time: "10:22", body: "Uploading spec" },
  { author: "You", time: "10:23", body: "Here is the working foundation for the app shell." },
];

export function ChatsPage() {
  const {
    inviteToRoom,
    joinRoom,
    leaveRoom,
    refreshRooms,
    selectedRoom,
  } = useRooms();
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [bans, setBans] = useState<RoomBan[]>([]);
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

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
          canManageMembers
            ? roomsApi.listBans(activeRoomId)
            : Promise.resolve({ bans: [] }),
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
              "Room created and ready for the next milestone of message history and realtime updates."}
          </p>
        </div>

        <div className="room-header-actions">
          <span className="status-pill status-pill--neutral">{selectedRoom.visibility}</span>
          <span className="status-pill status-pill--neutral">
            {selectedRoom.member_count} member{selectedRoom.member_count === 1 ? "" : "s"}
          </span>
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
          <div className="message-list">
            {sampleMessages.map((message) => (
              <article key={`${message.time}-${message.author}`} className="message-card">
                <header>
                  <strong>{message.author}</strong>
                  <time>{message.time}</time>
                </header>
                <p>{message.body}</p>
              </article>
            ))}
          </div>

          <footer className="composer-shell">
            <div className="composer-toolbar">
              <button type="button">Attach</button>
              <button type="button">Reply</button>
              <span>
                Messaging is the next Sprint 2 milestone. This room panel is now backed by real
                room membership data.
              </span>
            </div>
            <textarea
              rows={4}
              placeholder="Message input will connect after room messaging APIs land."
            />
            <div className="composer-actions">
              <button className="ghost-button" type="button">
                Save draft later
              </button>
              <button className="primary-button" type="button">
                Send
              </button>
            </div>
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
                        {member.is_owner
                          ? "Owner"
                          : member.is_admin
                            ? "Admin"
                            : "Member"}
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
