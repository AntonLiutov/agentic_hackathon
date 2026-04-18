# Sprint 2: Conversations and Realtime

## Sprint Goal

Deliver the core chat product: room discovery, room membership, direct-message conversations, persistent messaging, unread state, and realtime presence/message delivery.

## Scope

### SP2-01 Public and Private Rooms

- create room with unique name and description
- choose public or private visibility
- public room catalog with search
- public join and leave rules
- private room invitation flow

Acceptance criteria:

- public rooms appear in catalog with member count
- private rooms are hidden from catalog
- owner cannot leave their own room
- banned users cannot join or rejoin banned rooms

### SP2-02 Conversation Membership Rules

- unify room and DM membership model
- enforce room member visibility and access
- enforce room invitation rules
- enforce access loss after ban or removal

Acceptance criteria:

- current membership determines message and attachment access
- removed users lose room visibility and history access in the UI
- removal by admin is treated as a ban

### SP2-03 Direct Messages

- create personal dialog between two users
- render DMs with the same chat features as rooms
- keep DM-specific permissions separate from room moderation

Acceptance criteria:

- DMs behave like chat conversations with two participants
- DM history persists and loads identically to room history

### SP2-04 Message Lifecycle

- send room and DM messages
- multiline UTF-8 text support
- 3 KB message length limit
- reply to message
- edit own message
- delete own message
- admin delete in room conversations
- assign a monotonic per-conversation sequence or watermark for client integrity checks

Acceptance criteria:

- messages persist in chronological order
- reply UI clearly references the target message
- edited indicator appears in the UI
- deletion rules match authorship and room-admin permissions
- message events contain enough continuity information for the client to detect gaps safely

### SP2-05 Message History and Infinite Scroll

- cursor-based history APIs
- lazy loading of older messages
- preserve usability for 10,000+ messages
- correct auto-scroll behavior at the bottom only
- support recovery when the client detects a gap in live message continuity

Acceptance criteria:

- old messages load incrementally
- no forced auto-scroll when the user is reading older history
- scrolling remains stable during pagination
- the client can re-query history if live updates imply a missing message range

### SP2-06 Realtime Delivery

- authenticated WebSocket connection
- subscribe to active conversations
- broadcast new messages and edits/deletes
- reconnect handling
- use REST plus WebSockets together rather than forcing all state through one transport
- avoid any unbounded offline user message queue design

Acceptance criteria:

- message delivery is near-real-time in active chats
- reconnect restores live updates without manual refresh
- offline recipients still receive persisted history later
- offline catch-up is served from persisted history, not from indefinitely retained ephemeral queues

### SP2-07 Unread Indicators

- store per-conversation read state
- compute unread counts
- clear unread when chat is opened
- update sidebar badges in realtime

Acceptance criteria:

- unread badges appear for rooms and DMs
- opening a chat clears the indicator correctly
- unread state remains correct across reloads

### SP2-08 Presence

- per-tab heartbeat
- online, AFK, offline derivation
- show presence in contacts and room member lists
- low-latency propagation
- derive activity from browser interaction signals rather than cursor movement alone
- handle tab suspension and browser hibernation through TTL expiry semantics

Acceptance criteria:

- any active tab keeps the user online
- AFK is shown only when all tabs are idle for more than one minute
- closing all tabs eventually marks the user offline
- presence remains correct even when an inactive tab stops executing JavaScript

## Dependencies

- sprint depends on Sprint 1 auth and schema work
- unread implementation depends on message persistence
- presence depends on Redis integration from Sprint 1

## Risks

- unread logic and presence logic are easy to get subtly wrong
- mixing room and DM rules incorrectly will create permission leaks
- live update gap handling can be missed if message ordering is treated as "best effort"
- browser tab hibernation can invalidate naive presence implementations

## Exit Criteria

At sprint end, users can navigate rooms and DMs, message in realtime, read old history, see unread badges, and observe correct online/AFK/offline states.
