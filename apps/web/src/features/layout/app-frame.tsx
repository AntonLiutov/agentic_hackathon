import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useSession } from "../session/use-session";

const roomItems = [
  { name: "general", count: 14 },
  { name: "engineering-room", count: 38 },
  { name: "random", count: 7 },
];

const contactItems = [
  { name: "Alice", status: "online" },
  { name: "Bob", status: "online" },
  { name: "Carol", status: "AFK" },
  { name: "Mike", status: "offline" },
];

const appNavItems = [
  { to: "/app/chats", label: "Chats" },
  { to: "/app/contacts", label: "Contacts" },
  { to: "/app/sessions", label: "Sessions" },
  { to: "/app/profile", label: "Profile" },
];

function WorkspaceContextCard() {
  const location = useLocation();

  const heading = location.pathname.startsWith("/app/chats")
    ? "Room info"
    : location.pathname.startsWith("/app/contacts")
      ? "Contacts panel"
      : location.pathname.startsWith("/app/sessions")
        ? "Session details"
        : "Profile summary";

  return (
    <aside className="workspace-context">
      <h3>{heading}</h3>
      <p>
        This panel is the reserved space for room metadata, member status, session management,
        and profile controls as the product grows.
      </p>

      <div className="context-block">
        <strong>Members</strong>
        <ul>
          {contactItems.map((contact) => (
            <li key={contact.name}>
              <span>{contact.name}</span>
              <small>{contact.status}</small>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function AppFrame() {
  const { user, signOut } = useSession();

  return (
    <div className="workspace-page">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">AC</div>
          <div>
            <strong>Agentic Chat</strong>
            <p>Classic web chat foundation</p>
          </div>
        </div>

        <nav className="topbar-nav" aria-label="Primary">
          {appNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "topbar-link is-active" : "topbar-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="signed-in-user">
            <span>{user?.name}</span>
            <small>{user?.email}</small>
          </div>
          <button className="ghost-button" onClick={signOut} type="button">
            Sign out
          </button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="workspace-sidebar">
          <label className="sidebar-search">
            <span>Search</span>
            <input type="search" placeholder="Search rooms or contacts" />
          </label>

          <section className="sidebar-section">
            <div className="sidebar-heading">
              <h3>Public Rooms</h3>
              <button type="button">Create</button>
            </div>
            <ul>
              {roomItems.map((room) => (
                <li key={room.name}>
                  <span>#{room.name}</span>
                  <small>{room.count}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className="sidebar-section">
            <div className="sidebar-heading">
              <h3>Contacts</h3>
              <button type="button">Invite</button>
            </div>
            <ul>
              {contactItems.map((contact) => (
                <li key={contact.name}>
                  <span>{contact.name}</span>
                  <small>{contact.status}</small>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <main className="workspace-main">
          <Outlet />
        </main>

        <WorkspaceContextCard />
      </div>
    </div>
  );
}
