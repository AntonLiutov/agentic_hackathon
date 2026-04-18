import { Link } from "react-router-dom";

import { useSystemStatus } from "../features/system/use-system-status";
import { StatusPill } from "../shared/ui/status-pill";

const highlights = [
  "Protected app shell and route skeleton",
  "Frontend API client conventions",
  "Session bootstrap and preview sign-in",
  "Classic chat layout foundation",
];

export function LandingPage() {
  const systemStatus = useSystemStatus();

  return (
    <main className="landing-page">
      <section className="landing-hero card">
        <div className="hero-copy">
          <p className="eyebrow">Sprint 1 / SP1-03</p>
          <h1>Frontend foundation for a production-ready classic chat app</h1>
          <p className="lede">
            This layer establishes routing, shell structure, session bootstrap conventions, and
            API connectivity so the real product features can land without a frontend rewrite.
          </p>
        </div>

        <div className="hero-actions">
          <Link className="primary-button" to="/signin">
            Sign in
          </Link>
          <Link className="ghost-button" to="/register">
            Register
          </Link>
        </div>
      </section>

      <section className="landing-grid">
        <article className="card">
          <h2>Foundation highlights</h2>
          <ul className="bullet-list">
            {highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Backend status</h2>

          {systemStatus.state === "loading" ? (
            <p>Checking backend health and API metadata...</p>
          ) : null}

          {systemStatus.state === "error" ? (
            <>
              <StatusPill tone="warning">Needs attention</StatusPill>
              <p>{systemStatus.message}</p>
            </>
          ) : null}

          {systemStatus.state === "ready" ? (
            <div className="status-stack">
              <StatusPill
                tone={systemStatus.health.status === "ok" ? "success" : "warning"}
              >
                {systemStatus.health.status === "ok" ? "Healthy" : "Degraded"}
              </StatusPill>
              <dl className="data-list">
                <div>
                  <dt>Service</dt>
                  <dd>{systemStatus.health.service}</dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{systemStatus.meta.environment}</dd>
                </div>
                <div>
                  <dt>Database</dt>
                  <dd>{systemStatus.health.dependencies.database ? "Connected" : "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Redis</dt>
                  <dd>{systemStatus.health.dependencies.redis ? "Connected" : "Unavailable"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </article>
      </section>
    </main>
  );
}
