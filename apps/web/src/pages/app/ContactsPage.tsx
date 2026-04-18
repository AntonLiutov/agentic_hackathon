import { type FormEvent, useEffect, useMemo, useState } from "react";

import { getApiErrorMessage } from "../../shared/api/client";
import { dmsApi, type DirectMessage } from "../../shared/api/dms";

function sortDirectMessages(directMessages: DirectMessage[]) {
  return [...directMessages].sort((left, right) =>
    left.counterpart_username.localeCompare(right.counterpart_username),
  );
}

export function ContactsPage() {
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [selectedDirectMessageId, setSelectedDirectMessageId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

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

  async function handleOpenDirectMessage(event: FormEvent<HTMLFormElement>) {
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
  }

  const selectedDirectMessage = useMemo(
    () =>
      directMessages.find((directMessage) => directMessage.id === selectedDirectMessageId) ?? null,
    [directMessages, selectedDirectMessageId],
  );

  const sampleMessages = selectedDirectMessage
    ? [
        {
          author: selectedDirectMessage.counterpart_username,
          time: "10:31",
          body: "This direct message conversation is now backed by a real persisted DM record.",
        },
        {
          author: "You",
          time: "10:32",
          body: "Perfect. Message lifecycle and history will reuse the same conversation model next.",
        },
      ]
    : [];

  return (
    <section className="chat-workspace card">
      <header className="chat-header room-header">
        <div>
          <p className="eyebrow">Direct messages</p>
          <h1>One-to-one conversations</h1>
          <p>
            Personal dialogs now live on the shared conversation model, ready for the same message
            and history lifecycle that room chats will use.
          </p>
        </div>
      </header>

      {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
      {noticeMessage ? <p className="auth-success">{noticeMessage}</p> : null}

      <div className="chat-room-layout">
        <div className="chat-room-main">
          {selectedDirectMessage ? (
            <>
              <header className="chat-header room-header">
                <div>
                  <p className="eyebrow">Conversation</p>
                  <h2>{selectedDirectMessage.counterpart_username}</h2>
                  <p>{selectedDirectMessage.counterpart_email}</p>
                </div>

                <div className="room-header-actions">
                  <span className="status-pill status-pill--neutral">direct message</span>
                  <span className="status-pill status-pill--neutral">
                    {selectedDirectMessage.status}
                  </span>
                </div>
              </header>

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
                    Direct messages now share the same conversation backbone as rooms. Message send,
                    edit, delete, and history land in the next tasks.
                  </span>
                </div>
                <textarea
                  rows={4}
                  placeholder="Direct-message composer will connect after the message lifecycle APIs land."
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
            </>
          ) : (
            <div className="feature-list">
              <li>Open a direct message by username from the right panel.</li>
              <li>Existing one-to-one conversations stay listed and selectable here.</li>
              <li>
                The next message-history tasks will apply to both rooms and DMs through the same
                backend model.
              </li>
            </div>
          )}
        </div>

        <aside className="room-context-rail">
          <article className="session-card">
            <p className="session-card-kicker">Start conversation</p>
            <h2>Open a DM by username</h2>
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
          </article>

          <article className="session-card room-people-card">
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
                      <small>{directMessage.counterpart_email}</small>
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
