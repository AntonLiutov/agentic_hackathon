import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const foundationChecklist = [
  "Monorepo structure for API and web apps",
  "Root Docker Compose orchestration",
  "Health checks for API and web",
  "Environment examples for local and container runtime",
  "Foundation for Sprint 1 backend and frontend work",
];

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Sprint 1 / SP1-01</p>
        <h1>Agentic Chat Foundation</h1>
        <p className="lede">
          The repo skeleton is in place so we can move into authentication,
          sessions, conversations, and realtime chat without reworking the base
          platform.
        </p>
        <div className="status-card">
          <span className="status-label">API base URL</span>
          <code>{apiBaseUrl}</code>
        </div>
      </section>

      <section className="checklist">
        <h2>Current focus</h2>
        <ul>
          {foundationChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
