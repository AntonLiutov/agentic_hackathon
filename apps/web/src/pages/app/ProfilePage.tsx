const profileSections = [
  "Account details and immutable username display",
  "Password management entry points",
  "Delete-account confirmation flow",
  "Delivery of future preference settings",
];

export function ProfilePage() {
  return (
    <section className="placeholder-panel card">
      <p className="eyebrow">Profile</p>
      <h1>Profile and account shell</h1>
      <p>
        This route will later connect to password change, account deletion, and profile-level
        controls required by the specification.
      </p>

      <ul className="feature-list">
        {profileSections.map((section) => (
          <li key={section}>
            <strong>{section}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
