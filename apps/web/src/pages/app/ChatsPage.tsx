const sampleMessages = [
  { author: "Bob", time: "10:21", body: "Hello team" },
  { author: "Alice", time: "10:22", body: "Uploading spec" },
  { author: "You", time: "10:23", body: "Here is the working foundation for the app shell." },
];

export function ChatsPage() {
  return (
    <section className="chat-workspace card">
      <header className="chat-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>#engineering-room</h1>
          <p>Classic room shell with dedicated space for history, composer, and room controls.</p>
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
          <span>Multiline input area reserved for future chat composer</span>
        </div>
        <textarea rows={4} placeholder="Message input will connect after auth and messaging APIs exist." />
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
