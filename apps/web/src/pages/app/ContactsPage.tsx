const contacts = [
  { name: "Alice", note: "Ready for DM eligibility rules" },
  { name: "Carol", note: "Future friend request actions live here" },
  { name: "Mike", note: "User block and ban UX lands in later sprints" },
];

export function ContactsPage() {
  return (
    <section className="placeholder-panel card">
      <p className="eyebrow">Contacts</p>
      <h1>Contact and friend management shell</h1>
      <p>
        This route is ready for friend requests, contact status, and personal-dialog entry points.
      </p>

      <ul className="feature-list">
        {contacts.map((contact) => (
          <li key={contact.name}>
            <strong>{contact.name}</strong>
            <p>{contact.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
