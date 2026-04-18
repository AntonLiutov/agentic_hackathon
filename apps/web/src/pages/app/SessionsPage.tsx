const sessionChecklist = [
  "Current browser session card",
  "Other active device list",
  "Targeted revocation actions",
  "IP and browser metadata presentation",
];

export function SessionsPage() {
  return (
    <section className="placeholder-panel card">
      <p className="eyebrow">Sessions</p>
      <h1>Active-session management shell</h1>
      <p>
        The backend foundation now supports session-oriented architecture. This screen reserves the
        frontend structure for selective session revocation and activity metadata.
      </p>

      <ul className="feature-list">
        {sessionChecklist.map((item) => (
          <li key={item}>
            <strong>{item}</strong>
            <p>Implementation follows once auth and session APIs are available.</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
