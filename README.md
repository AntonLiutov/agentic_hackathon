# agentic_hackathon

Classic web chat platform built for the AI Herders Jam requirements.

## Current Status

Sprint 1, Sprint 2, and Sprint 3 are complete. Sprint 4 is in progress. The repository now includes:

- planning and architecture docs
- backend and frontend application skeletons
- root Docker Compose orchestration
- health checks and example environment configuration
- frontend route skeleton for landing, auth, and workspace flows
- working registration, login, session bootstrap, and logout flows
- active session listing and targeted session revocation
- password change and email-based password reset flow
- public and private room creation
- public room catalog with search
- join and leave room flows
- private-room invitation acceptance
- room membership enforcement and admin removal-as-ban behavior
- direct-message conversations on the shared conversation model
- shared message lifecycle for rooms and DMs:
  - send
  - reply
  - edit
  - delete
  - admin delete in rooms
- cursor-based message history loading with stable prepend behavior
- incremental older-message loading in room and DM workspaces
- authenticated WebSocket delivery for the active room or direct message
- live message create, edit, and delete updates across connected clients
- reconnect-aware realtime status in the room and DM workspaces
- unread badges for rooms and direct messages
- read-state clearing when a room or DM is opened
- multi-tab presence heartbeat with `online`, `AFK`, and `offline` derivation
- presence shown in room member lists and direct-message surfaces
- sidebar navigation from non-chat routes into the correct chat workspace
- privacy-safe conversation lists that no longer expose other users' email addresses
- friendship requests with accept, reject, and remove flows
- friendship actions from the contacts view and room member list
- presence-aware friend list entries and pending request views
- live friendship request and removal sync across already-open clients
- incoming friend-request badge on the `Contacts` navigation tab
- protected attachment downloads through backend authorization checks
- immediate room attachment access loss after room removal or ban
- DM attachment access limited to actual DM participants
- account deletion with owned-room cleanup, room-membership removal, and preserved frozen DM history for surviving participants
- permanent attachment file cleanup for deleted owned rooms
- requirements audit in `docs/requirements-audit.md`
- validation checklist in `docs/validation-checklist.md`
- composer emoji picker with search, categories, and recent emoji
- active room and DM resync after websocket reconnect

## Repository Structure

- `apps/api`: FastAPI backend
- `apps/web`: React + Vite frontend
- `docs`: planning, architecture, sprint tracking, and working agreement

## Quality and Test Structure

- `apps/api/tests/unit`: backend unit tests
- `apps/api/tests/integration`: backend API and service integration tests
- `apps/web/tests/unit`: frontend unit and component tests
- `apps/web/tests/integration`: frontend higher-level integration coverage

## Quick Start

1. Copy `.env.example` to `.env`.
2. Run `docker compose up --build` from the repository root.
3. Open `http://localhost:3000`.
4. API health is available at `http://localhost:8000/healthz`.
5. Mailpit inbox UI is available at `http://localhost:8025`.
6. Register a user or sign in with an existing account to enter the protected workspace shell.

## Local Verification

### Backend

Run Ruff formatting and checks:

```powershell
cd apps/api
uv run ruff format .
uv run ruff check .
```

Run backend tests:

```powershell
cd apps/api
uv run pytest tests
```

### Frontend

Install frontend dependencies and run frontend tests:

```powershell
cd apps/web
npm ci
npm run test
```

If `npm` is not installed locally, you can run the frontend tests in Docker:

```powershell
docker run --rm -v ${PWD}:/workspace -w /workspace/apps/web node:20-alpine sh -lc "npm ci && npm test"
```

### Full Stack

Start the full application:

```powershell
docker compose up --build
```

If the first API image build is slow because package downloads are flaky, use:

```powershell
docker compose build api --progress=plain
docker compose up
```

The API image now installs from `uv.lock`, so retries should be much more stable and subsequent builds should reuse the dependency cache.

Basic checks after startup:

1. Open `http://localhost:3000` and confirm the foundation page loads.
2. Register a new account from `/register` and confirm you are redirected into `/app/chats`.
3. Refresh the browser and confirm the session is restored automatically.
4. Open `/app/sessions` and confirm the current browser session is shown separately from other active sessions.
5. Sign in to the same account in another browser or private window, then revoke that other session from `/app/sessions`.
6. Confirm the revoked browser can no longer access protected routes, while the current browser stays signed in.
7. Open `/app/profile`, change the password, and confirm you are returned to sign-in with a success notice.
8. Open `/forgot-password`, submit your email, then open Mailpit at `http://localhost:8025` and use the emailed reset link.
9. Confirm old passwords and old browser sessions no longer work after the password rotation.
10. In `/app/chats`, create one public room and one private room from the sidebar.
11. Sign in with a second account and confirm only the public room appears in the public catalog.
12. Join the public room and confirm it appears in `Your Rooms`.
13. Sign back in as the private-room owner, invite the second user from the private room panel, then accept that invitation from the second account.
14. Confirm the accepted private room appears in `Your Rooms` but never in the public catalog.
15. In a shared room, send a message, reply to it, edit it, and delete it. Confirm the edited indicator and deleted-message state appear correctly.
16. Remove a member from a room as the room owner/admin and confirm they lose room access.
17. In a room conversation, use `Attach` to upload an image or file, add an optional attachment comment, and confirm the original filename renders in the message.
18. Download that attachment from the message card and confirm the file content is served by the backend.
19. In either a room or DM, use `Load older messages` after there is enough history and confirm older messages prepend without yanking the viewport to the bottom.
20. Open the same shared room in two browsers or one browser plus a private window, send a new message from one side, and confirm it appears on the other side without refresh.
21. Edit or delete that same message and confirm the other client updates live as well.
22. Repeat the same live update check in a direct message conversation.
23. While one user is reading a room or DM, send a message from the other side and confirm the new message does not show `Edit` or `Delete` buttons for the non-author.
24. Leave one room or DM inactive, send a new message into it from another client, and confirm the corresponding sidebar unread badge increments.
25. Open that unread room or DM and confirm the unread badge clears after the conversation loads.
26. From `/app/contacts`, click a room in the left sidebar and confirm the app navigates into `/app/chats` with that room selected.
27. Refresh one of the conversation tabs and confirm the workspace reconnects and returns to `live updates`.
28. Open the same account in two tabs and keep one tab active. Confirm room members and direct-message surfaces show that user as `online`.
29. Leave both tabs idle for more than one minute and confirm the status changes to `AFK`.
30. Close all tabs for that account, wait for the heartbeat TTL window, and confirm the user eventually appears `offline`.
31. Use the workspace sign-out action and confirm protected routes redirect back to `/signin`.
32. Open `http://localhost:8000/healthz` and confirm the API returns `status: ok`.
33. Open `http://localhost:3000/` and confirm the frontend responds.
34. Open `/app/contacts`, send a friend request by username, and confirm it appears in `Outgoing requests`.
35. Sign in as the recipient, open `/app/contacts`, and confirm the request appears in `Incoming requests`.
36. Accept the request and confirm both accounts now see each other in the `Friends` list with presence.
37. From `/app/contacts`, use `Open DM` on a confirmed friend and confirm the DM appears in the direct-message list.
38. Send a message inside that DM, then attach a file or image there as well and confirm both render in the shared conversation UI.
39. Open a shared room containing a non-friend member, click `Add friend` from the member list, and confirm the request state changes to `Request sent`.
40. Remove an existing friend from `/app/contacts` and confirm the friendship disappears from both accounts.
41. Keep the recipient account open on `/app/contacts`, send a friend request from another client, and confirm the incoming request appears without refreshing the page.
42. Confirm the `Contacts` top navigation shows a badge when there is a pending incoming friend request and no direct-message unread count is currently displayed.
43. From `/app/contacts`, block an existing friend and confirm the friend disappears from `Friends` and appears under `Blocked users`.
44. Open an existing DM with that blocked user and confirm the conversation becomes read-only, shows the frozen state, and disables message sending.
45. Attempt to open a brand-new DM with a blocked user and confirm the UI shows a friendly error instead of opening the conversation.
46. Unblock the user and confirm they disappear from `Blocked users`.
47. Confirm unblocking does not automatically restore the friendship, and that the frozen DM stays read-only until friendship is re-established.
48. In a room, upload an attachment, then open its download URL from a non-member account and confirm access is denied.
49. Upload an attachment as a room member, remove that member from the room, and confirm the old attachment URL no longer downloads for them while the file remains stored for the room.
50. In a DM, upload an attachment, then try the attachment URL from a third user who is not part of the DM and confirm access is denied.
51. In a frozen DM created by a user-to-user block, confirm existing attachment history still remains downloadable for the two DM participants.
52. From `/app/profile`, delete an account using the current password and confirm you return to sign-in with a success notice.
53. Sign in as another user and confirm rooms owned by the deleted account are gone permanently.
54. Confirm rooms owned by other users survive, but the deleted account no longer appears in their member list.
55. If the deleted user had an existing DM, confirm the surviving participant still sees that history, the counterpart is shown as `Deleted user`, and the DM is read-only.

For a grouped validation path and current coverage snapshot, see `docs/validation-checklist.md`.

Stop the stack:

```powershell
docker compose down
```

## Implemented Task Coverage

This repository currently targets:

- `SP1-01 Repository and Delivery Skeleton`
- `SP1-02 Backend Foundation`
- `SP1-03 Frontend Foundation`
- `SP1-04 Core Schema`
- `SP1-05 Registration and Login`
- `SP1-06 Persistent Sessions`
- `SP1-07 Password Management`
- `SP2-01 Public and Private Rooms`
- `SP2-02 Conversation Membership Rules`
- `SP2-03 Direct Messages`
- `SP2-04 Message Lifecycle`
- `SP2-05 Message History and Infinite Scroll`
- `SP2-06 Realtime Delivery`
- `SP2-07 Unread Indicators`
- `SP2-08 Presence`
- `SP3-01 Friendships`
- `SP3-02 User-to-User Bans`
- `SP3-03 Room Administration`
- `SP3-04 Room Bans and Access Consistency`
- `SP3-05 Attachments`
- `SP3-06 Attachment Authorization`
- `SP3-07 Account Deletion`
- `SP4-02 Reliability and Edge Cases`
- `SP4-03 Validation and Test Coverage`

Sprint 3 is complete. Sprint 4 is underway with reliability hardening and validation completed first, followed by performance/demo-data work, UI polish, and submission readiness.
