import { useEffect, useMemo, useState } from "react";

import { authApi, type ActiveSession } from "../../shared/api/auth";
import { getApiErrorMessage } from "../../shared/api/client";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not available yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getSessionLabel(session: ActiveSession) {
  const userAgent = session.user_agent?.trim();

  if (!userAgent) {
    return session.is_current ? "This browser session" : "Browser session";
  }

  if (userAgent.includes("Chrome")) {
    return "Chrome browser";
  }

  if (userAgent.includes("Firefox")) {
    return "Firefox browser";
  }

  if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    return "Safari browser";
  }

  if (userAgent.includes("Edg")) {
    return "Microsoft Edge browser";
  }

  return "Browser session";
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadSessions() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await authApi.listSessions();

        if (isCancelled) {
          return;
        }

        setSessions(response.sessions);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setErrorMessage(getApiErrorMessage(error, "Unable to load active sessions right now."));
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSessions();

    return () => {
      isCancelled = true;
    };
  }, []);

  const currentSession = useMemo(
    () => sessions.find((session) => session.is_current) ?? null,
    [sessions],
  );
  const otherSessions = useMemo(
    () => sessions.filter((session) => !session.is_current),
    [sessions],
  );

  async function handleRevokeSession(sessionId: string) {
    setNoticeMessage(null);
    setErrorMessage(null);
    setRevokingSessionId(sessionId);

    try {
      await authApi.revokeSession(sessionId);
      setSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId));
      setNoticeMessage("Selected session was revoked.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to revoke that session right now."));
    } finally {
      setRevokingSessionId(null);
    }
  }

  return (
    <section className="placeholder-panel card sessions-panel">
      <p className="eyebrow">Security</p>
      <h1>Active sessions</h1>
      <p>See where you are signed in and revoke old sessions when needed.</p>

      {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
      {noticeMessage ? <p className="auth-success">{noticeMessage}</p> : null}

      {isLoading ? (
        <p>Loading active sessions...</p>
      ) : (
        <div className="session-layout">
          <article className="session-card session-card--current">
            <div className="session-card-header">
              <div>
                <p className="session-card-kicker">Current browser</p>
                <h2>{currentSession ? getSessionLabel(currentSession) : "Current session unavailable"}</h2>
              </div>
              <span className="status-pill status-pill--success">Active now</span>
            </div>
            {currentSession ? (
              <dl className="session-meta">
                <div>
                  <dt>IP address</dt>
                  <dd>{currentSession.ip_address ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Signed in</dt>
                  <dd>{formatTimestamp(currentSession.created_at)}</dd>
                </div>
                <div>
                  <dt>Last active</dt>
                  <dd>{formatTimestamp(currentSession.last_seen_at)}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{formatTimestamp(currentSession.expires_at)}</dd>
                </div>
              </dl>
            ) : (
              <p>Current session details are unavailable right now.</p>
            )}
          </article>

          <section className="session-stack">
            <div className="sidebar-heading">
              <h3>Other active sessions</h3>
              <small>{otherSessions.length} session(s)</small>
            </div>

            {otherSessions.length === 0 ? (
              <div className="session-card">
                <strong>No other active sessions</strong>
                <p>This account is only signed in on this browser.</p>
              </div>
            ) : (
              otherSessions.map((session) => (
                <article key={session.id} className="session-card">
                  <div className="session-card-header">
                    <div>
                      <p className="session-card-kicker">Other browser</p>
                      <h3>{getSessionLabel(session)}</h3>
                    </div>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={revokingSessionId === session.id}
                      onClick={() => {
                        void handleRevokeSession(session.id);
                      }}
                    >
                      {revokingSessionId === session.id ? "Revoking..." : "Revoke"}
                    </button>
                  </div>
                  <dl className="session-meta">
                    <div>
                      <dt>IP address</dt>
                      <dd>{session.ip_address ?? "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Signed in</dt>
                      <dd>{formatTimestamp(session.created_at)}</dd>
                    </div>
                    <div>
                      <dt>Last active</dt>
                      <dd>{formatTimestamp(session.last_seen_at)}</dd>
                    </div>
                    <div>
                      <dt>Expires</dt>
                      <dd>{formatTimestamp(session.expires_at)}</dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </section>
        </div>
      )}
    </section>
  );
}
