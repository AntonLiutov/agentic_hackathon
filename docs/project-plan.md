# Project Plan

## Objective

Build a classic web-based online chat application that satisfies the provided specification, is runnable with `docker compose up` from the repository root, and is strong enough for a public demo and technical review.

This plan treats the assignment as a real-time chat platform with strict consistency rules rather than a simple message UI.

## Product Scope

### In Scope

- user registration, authentication, password change, password reset
- persistent multi-session login behavior
- active sessions listing and targeted session revocation
- online, AFK, and offline presence across multiple browser tabs
- public and private chat rooms
- one-to-one personal dialogs
- friends, friend requests, and user-to-user bans
- room ownership, admins, bans, invitations, and moderation
- persistent message history with infinite scroll
- message replies, edits, and deletes
- file and image sharing with permission-checked access
- unread counters and low-latency presence updates
- account deletion behavior defined by the specification
- Docker-based local deployment

### Stretch Scope

- Jabber / XMPP support
- federation between servers
- Jabber admin dashboard and traffic statistics
- federation load testing

## Delivery Strategy

We will cover the full base specification first. The work is split into mutually exclusive but collectively complete epics so every requirement has one clear owner area and no major feature is planned twice.

## Architecture Summary

### Recommended Stack

- frontend: React + TypeScript + Vite
- backend: FastAPI + SQLAlchemy + Alembic
- database: PostgreSQL
- ephemeral real-time state: Redis
- file storage: local filesystem mounted into the API container
- tests: pytest for backend and Playwright for end-to-end flows
- local orchestration: Docker Compose

### Key Architecture Decisions

1. Use a modular monolith.
   One backend service, one frontend service, one Postgres instance, one Redis instance, and local file storage are enough for the assignment and fastest to stabilize.

2. Model rooms and direct messages as one conversation system.
   Both room chat and personal chat share message, attachment, history, and unread logic. Policy differences live in membership and permission rules.

3. Use server-side session authentication with secure cookies.
   The requirements around current-session logout, persistent login, and selective session revocation are simpler and safer with opaque session tokens than with JWT-only auth.

4. Persist before broadcast.
   Messages and state-changing events are committed to Postgres first, then broadcast over WebSockets. Redis supports ephemeral presence and pub/sub fan-out, but not durable delivery.

5. Protect attachments through the API.
   Files are never served as raw public assets. Every attachment download goes through permission checks based on current membership and access rules.

## Epics

### EPIC-01 Platform and Delivery

- repository structure
- environment management
- Docker Compose
- health checks
- CI-ready commands
- seed/demo data strategy

### EPIC-02 Identity and Sessions

- registration
- login and logout
- persistent session cookies
- current user endpoint
- password change
- password reset
- active sessions screen and selective revocation
- account deletion flow

### EPIC-03 Presence and Social Graph

- multi-tab presence heartbeat
- online, AFK, and offline derivation
- friend requests and friendship lifecycle
- user-to-user bans
- DM eligibility rules based on friendship and bans

### EPIC-04 Conversations and Membership

- public rooms
- private rooms
- room catalog and search
- invitations
- join and leave rules
- owner/admin/member roles
- room bans and access removal semantics
- direct-message conversation creation and membership logic

### EPIC-05 Messaging and Attachments

- room and DM messaging
- replies
- edits
- deletions
- history APIs with infinite scroll
- unread state
- offline delivery via persisted history
- file and image upload
- paste upload
- attachment comments and original filenames

### EPIC-06 Moderation and Governance

- room admin tools
- banned user management
- moderator deletion of room messages
- owner-only room deletion
- audit-friendly event logging where useful
- access consistency for messages and attachments after revocation

### EPIC-07 UX, Reliability, and Submission

- classic chat layout matching the wireframe
- chat usability rules such as conditional auto-scroll
- error states and reconnect behavior
- performance guardrails for 10,000+ messages
- test coverage for critical business rules
- final documentation and `docker compose up` success path

### EPIC-08 Jabber and Federation

- XMPP integration
- admin-facing Jabber screens
- federation setup
- federation load test

This epic starts only after the base specification is stable.

## Requirements Coverage

| Requirement Area | Owning Epic |
| --- | --- |
| accounts, auth, passwords, sessions, account deletion | EPIC-02 |
| presence and multi-tab behavior | EPIC-03 |
| friends, personal bans, DM eligibility | EPIC-03 |
| room creation, join, invitations, bans, admins | EPIC-04 and EPIC-06 |
| messaging, history, replies, edits, deletes | EPIC-05 |
| attachments and access control | EPIC-05 and EPIC-06 |
| unread indicators and real-time updates | EPIC-05 and EPIC-07 |
| layout, chat UX, modal admin UI | EPIC-07 |
| Docker submission requirement | EPIC-01 and EPIC-07 |
| Jabber / federation | EPIC-08 |

## Definition of Done

A task is done only when all of the following are true:

- implementation is merged locally and integrated with surrounding flows
- migrations are added when schema changes are involved
- API contract or UI behavior is documented where needed
- at least one validation path exists: automated test or explicit manual checklist
- feature behavior matches the specification, not just a happy path
- no known blocker remains for demoing the feature

## Sprint Structure

- [Sprint 1](./sprints/sprint-01-foundation-and-identity.md): foundation, delivery skeleton, auth, sessions, core data model
- [Sprint 2](./sprints/sprint-02-conversations-and-realtime.md): rooms, DMs, messaging, history, unread, presence
- [Sprint 3](./sprints/sprint-03-social-governance-and-security.md): friends, bans, moderation, attachments, account rules
- [Sprint 4](./sprints/sprint-04-hardening-submission-and-xmpp.md): polish, reliability, performance, submission readiness, stretch XMPP

## Execution Rules

1. Build vertical slices, not isolated backend-only features.
   For each core capability, ship the minimal backend, frontend, and validation together.

2. Prioritize irreversible design decisions early.
   Session model, conversation model, message storage, and attachment access rules should be decided before UI expansion.

3. Keep demoability high at every checkpoint.
   After each sprint, the app should be runnable and show real user-facing progress.

4. Treat consistency bugs as first-class issues.
   Presence correctness, unread correctness, membership enforcement, and access revocation are more important than decorative polish.
