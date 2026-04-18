# Architecture

## System Shape

The application will be implemented as a modular monolith:

- `apps/api`: FastAPI service
- `apps/web`: React frontend
- `postgres`: durable relational storage
- `redis`: ephemeral presence and realtime fan-out support
- `storage`: local filesystem for attachments

This keeps the system small enough for hackathon speed while still separating concerns cleanly.

## Core Domain Model

### Identity

- `users`
- `user_credentials`
- `user_sessions`
- `password_reset_tokens`

### Social Graph

- `friend_requests`
- `friendships`
- `user_blocks`

### Conversations

- `conversations`
  - type: `room` or `dm`
- `conversation_members`
- `room_metadata`
- `room_admins`
- `room_bans`
- `room_invitations`
- `dm_metadata`

### Messaging

- `messages`
- `attachments`
- `message_attachments`
- `conversation_reads`

### Audit and Security

- `security_events`
- `moderation_events`

## Realtime Model

### WebSockets

WebSockets are used for:

- live message delivery
- presence updates
- unread refresh signals
- room membership updates where useful

### Presence

Each browser tab gets a `tab_id`.

The client sends heartbeat and recent interaction signals. Redis stores per-tab TTL state. User presence is derived as:

- `online`: any live tab has recent activity
- `afk`: at least one live tab exists, but all live tabs are idle for more than one minute
- `offline`: no live tabs remain

## Authentication Model

Authentication is session-based:

- the client stores an opaque token in a secure HttpOnly cookie
- the backend maps the token to a `user_sessions` record
- session listing and selective revocation operate on session rows

This directly supports the specification's current-session logout and active-sessions requirements.

## Permission Model

### Room Conversations

- owners can do everything allowed by the room specification
- admins can moderate members and messages but cannot strip ownership
- members can access content while membership is active
- banned users cannot rejoin until unbanned

### DM Conversations

- DMs are two-member conversations with no admins
- DM creation requires friendship and no block in either direction
- existing DM history remains visible but frozen when a user-to-user ban occurs

### Attachments

Attachment access is evaluated at request time. A valid URL alone is never enough to download a file.

## Message and Read Model

- messages are stored durably in Postgres
- history APIs use cursor pagination for infinite scroll
- unread state is represented by `last_read_message_id` per user and conversation
- opening a chat updates read state and triggers unread refresh events

## Deletion Semantics

### Room Deletion

- delete room
- delete room messages
- delete room attachments from storage

### Account Deletion

- delete rooms owned by the user
- remove their memberships elsewhere
- preserve or anonymize references safely enough to avoid corrupting surviving history

The exact implementation must respect the specification without causing broken foreign-key chains in surviving conversations.

## Non-Functional Targets

- up to 300 simultaneous users
- message delivery target under 3 seconds
- presence update target under 2 seconds
- room history remains usable at 10,000+ messages

## Deployment Contract

The repository root must support:

```bash
docker compose up
```

That command should start the full local system in a demoable state.
