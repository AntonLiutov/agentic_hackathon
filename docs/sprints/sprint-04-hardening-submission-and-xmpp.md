# Sprint 4: Hardening, Submission, and XMPP

## Sprint Goal

Make the product stable, demo-ready, and submission-ready, then tackle Jabber support only after the base requirements are complete and defensible.

## Scope

### SP4-01 UI Completion and Polish

- align layout with the wireframe
- improve sidebars, member panel, and message composer
- improve modal UX for admin actions
- handle empty, loading, and error states

Acceptance criteria:

- the UI reads as a classic web chat
- primary flows are understandable without explanation
- admin features are discoverable through menus and modals

### SP4-02 Reliability and Edge Cases

- reconnect and retry behavior
- race-condition hardening for unread and presence
- defensive permission checks
- clean handling for deleted resources and stale tabs

Acceptance criteria:

- common refresh or reconnect cases do not break chat usage
- unread and presence remain correct under normal concurrent usage

### SP4-03 Validation and Test Coverage

- backend tests for core permission rules
- end-to-end tests for auth, messaging, unread, presence, attachments, moderation
- manual regression checklist for demo
- include validation for gap recovery and message history integrity behavior

Acceptance criteria:

- critical business rules have automated coverage
- a fresh environment can run the test suite and demo path

### SP4-04 Performance and Demo Data

- seed realistic demo users, rooms, and messages
- test large-history pagination behavior
- verify latency targets under lightweight local load
- explicitly validate very large room history traversal, including seeded cases around 100,000 messages if feasible

Acceptance criteria:

- app remains usable with large chat history
- demo environment feels populated and convincing
- at least one validation path exists for progressive loading of very old, high-volume room history

### SP4-05 Submission Readiness

- root-level run instructions
- environment documentation
- final repository cleanup
- confirm `docker compose up` from root works on a clean clone

Acceptance criteria:

- repo is understandable to a reviewer
- setup path is straightforward and reproducible
- final demo steps are documented

### SP4-06 XMPP and Federation

- choose XMPP integration approach
- add Jabber-compatible server support
- expose Jabber admin dashboard or stats in the app
- attempt federation between two servers
- attempt federation load scenario if feasible

Acceptance criteria:

- this work starts only after base requirements are complete
- the base app remains stable even if XMPP remains partial

## Dependencies

- Sprint 4 depends on the base specification being substantially complete
- XMPP work is gated behind completion of the standard chat product

## Risks

- polish can expand endlessly if not tied to concrete user flows
- XMPP can consume disproportionate time if started too early

## Exit Criteria

At sprint end, the repository is submission-ready, the core product is stable and demoable, and any XMPP work is clearly separated as stretch progress rather than mixed into unfinished core functionality.
