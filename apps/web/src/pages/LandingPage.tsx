import { Link } from "react-router-dom";

const previewMessages = [
  {
    author: "Alice",
    time: "10:18",
    text: "Specs are in. I pinned the final checklist for the release.",
  },
  {
    author: "You",
    time: "10:19",
    text: "Great. I'm updating the room notes and attaching the design file.",
    own: true,
  },
  {
    author: "Bob",
    time: "10:21",
    text: "Private handoff looks clean now. Nothing feels buried anymore.",
  },
  {
    author: "You",
    time: "10:22",
    text: "Perfect. Invite flow is ready and the unread state looks correct.",
    own: true,
  },
  {
    author: "Alice",
    time: "10:24",
    text: "Ship it after one last pass on the release room.",
  },
  {
    author: "You",
    time: "10:25",
    text: "Done. Everything is ready for the team.",
    own: true,
  },
];

export function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-shell card">
        <header className="landing-nav">
          <div className="brand-lockup brand-lockup--landing">
            <div className="brand-mark">AC</div>
            <div>
              <strong>Agentic Chat</strong>
              <p>Team chat that stays out of the way</p>
            </div>
          </div>

          <div className="hero-actions">
            <Link className="ghost-button" to="/signin">
              Sign in
            </Link>
            <Link className="primary-button" to="/register">
              Create account
            </Link>
          </div>
        </header>

        <div className="landing-grid landing-grid--hero">
          <div className="landing-copy">
            <p className="eyebrow">Rooms, direct messages, files</p>
            <h1>Clear chat for teams that need to move fast</h1>
            <p className="lede">
              Keep public rooms, private work, and direct messages in one clean workspace that is
              easy to follow.
            </p>

            <div className="hero-actions">
              <Link className="primary-button" to="/register">
                Get started
              </Link>
              <Link className="ghost-button" to="/signin">
                Sign in
              </Link>
            </div>
          </div>

          <div className="landing-preview">
            <div className="landing-preview-sidebar">
              <div className="landing-preview-section">
                <strong>Public Rooms</strong>
                <button type="button"># general</button>
                <button className="is-active" type="button">
                  # engineering
                  <span className="sidebar-badge">3</span>
                </button>
                <button type="button">
                  # launch
                  <span className="sidebar-badge">1</span>
                </button>
              </div>

              <div className="landing-preview-section">
                <strong>Private Rooms</strong>
                <button type="button">🔒 core-team</button>
                <button type="button">🔒 ops</button>
              </div>

              <div className="landing-preview-section">
                <strong>Direct Messages</strong>
                <button type="button">Alice</button>
                <button type="button">
                  Bob
                  <span className="sidebar-badge">2</span>
                </button>
                <button type="button">Carol</button>
              </div>

              <button className="landing-preview-create ghost-button" type="button">
                Create room
              </button>
            </div>

            <div className="landing-preview-main">
              <div className="landing-preview-header">
                <div>
                  <strong># engineering</strong>
                  <small>Public · 38 members</small>
                </div>
                <span className="status-pill status-pill--success">Live</span>
              </div>

              <div className="landing-preview-thread">
                {previewMessages.map((message) => (
                  <article
                    key={`${message.author}-${message.time}`}
                    className={message.own ? "landing-message landing-message--own" : "landing-message"}
                  >
                    <header>
                      <strong>{message.author}</strong>
                      <time>{message.time}</time>
                    </header>
                    <p>{message.text}</p>
                  </article>
                ))}
              </div>

              <footer className="landing-preview-composer">
                <button type="button">😊</button>
                <button type="button">📎</button>
                <span>Write a message...</span>
                <button className="primary-button" type="button">
                  Send
                </button>
              </footer>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
