import { type FormEvent, useEffect, useMemo, useState } from "react";

import { getApiErrorMessage } from "../../shared/api/client";
import { dmsApi, type DirectMessage } from "../../shared/api/dms";
import {
  messagesApi,
  type ConversationMessage,
} from "../../shared/api/messages";

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

export function ContactsPage() {
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [selectedDirectMessageId, setSelectedDirectMessageId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [composeText, setComposeText] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sequenceHead, setSequenceHead] = useState(0);
  const [replyTarget, setReplyTarget] = useState<ConversationMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [updatingMessageId, setUpdatingMessageId] = useState<number | null>(null);
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

  useEffect(() => {
    let isCancelled = false;

    async function loadMessages() {
      if (!selectedDirectMessageId) {
        setMessages([]);
        setSequenceHead(0);
        setReplyTarget(null);
        setEditingMessageId(null);
        setComposeText("");
        setIsLoadingMessages(false);
        return;
      }

      setIsLoadingMessages(true);
      setErrorMessage(null);

      try {
        const response = await messagesApi.list(selectedDirectMessageId);

        if (isCancelled) {
          return;
        }

        setMessages(response.messages);
        setSequenceHead(response.sequence_head);
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
  }, [selectedDirectMessageId]);

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
          currentMessages.map((message) =>
            message.id === updatedMessage.id ? updatedMessage : message,
          ),
        );
        setNoticeMessage("Message updated.");
      } else {
        const createdMessage = await messagesApi.create(selectedDirectMessage.id, {
          body_text: composeText,
          reply_to_message_id: replyTarget?.id,
        });
        setMessages((currentMessages) => [...currentMessages, createdMessage]);
        setSequenceHead(createdMessage.sequence_number);
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
        currentMessages.map((currentMessage) =>
          currentMessage.id === deletedMessage.id ? deletedMessage : currentMessage,
        ),
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

  return (
    <section className="chat-workspace card">
      <header className="chat-header room-header">
        <div>
          <p className="eyebrow">Direct messages</p>
          <h1>One-to-one conversations</h1>
          <p>
            Personal dialogs now live on the shared conversation model, with persisted messages,
            replies, edits, deletes, and continuity sequence numbers.
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
                  <span className="status-pill status-pill--neutral">sequence {sequenceHead}</span>
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
                <div className="message-list">
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
