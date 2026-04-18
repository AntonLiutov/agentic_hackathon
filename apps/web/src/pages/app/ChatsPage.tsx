import { type FormEvent, useState } from "react";

import { useRooms } from "../../features/rooms/use-rooms";
import { getApiErrorMessage } from "../../shared/api/client";

const sampleMessages = [
  { author: "Bob", time: "10:21", body: "Hello team" },
  { author: "Alice", time: "10:22", body: "Uploading spec" },
  { author: "You", time: "10:23", body: "Here is the working foundation for the app shell." },
];

export function ChatsPage() {
  const { inviteToRoom, leaveRoom, myRooms, selectedRoom } = useRooms();
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);

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

      <div className="room-summary-grid">
        <article className="session-card">
          <p className="session-card-kicker">Membership</p>
          <h2>{selectedRoom.is_owner ? "Owner controls" : "Participant view"}</h2>
          <p>
            {selectedRoom.is_owner
              ? "You own this room, so later sprint tasks will extend this panel with moderation and admin controls."
              : "You are a room participant. Message history, unread state, and presence will build on this membership."}
          </p>
          <dl className="session-meta">
            <div>
              <dt>Visibility</dt>
              <dd>{selectedRoom.visibility}</dd>
            </div>
            <div>
              <dt>My rooms</dt>
              <dd>{myRooms.length}</dd>
            </div>
          </dl>
        </article>

        {selectedRoom.visibility === "private" && selectedRoom.is_owner ? (
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
      </div>

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
            Messaging is the next Sprint 2 milestone. This room panel is now backed by real room
            membership data.
          </span>
        </div>
        <textarea rows={4} placeholder="Message input will connect after room messaging APIs land." />
        <div className="composer-actions">
          <button className="ghost-button" type="button">
            Save draft later
          </button>
          <button className="primary-button" type="button">
            Send
          </button>
        </div>
      </footer>
    </section>
  );
}
