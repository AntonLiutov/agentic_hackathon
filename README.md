# agentic_hackathon

Classic web chat platform built for the AI Herders Jam requirements.

## Current Status

Sprint 1 is complete and Sprint 2 is implemented through realtime delivery. The repository now includes:

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
17. Open `/app/contacts`, create a direct message by username, and confirm the DM appears in the direct-message list.
18. Send a message inside the DM, then reply to or edit your own message.
19. In either a room or DM, use `Load older messages` after there is enough history and confirm older messages prepend without yanking the viewport to the bottom.
20. Open the same shared room in two browsers or one browser plus a private window, send a new message from one side, and confirm it appears on the other side without refresh.
21. Edit or delete that same message and confirm the other client updates live as well.
22. Repeat the same live update check in a direct message conversation.
23. Refresh one of the conversation tabs and confirm the workspace reconnects and returns to `live updates`.
24. Use the workspace sign-out action and confirm protected routes redirect back to `/signin`.
25. Open `http://localhost:8000/healthz` and confirm the API returns `status: ok`.
26. Open `http://localhost:3000/` and confirm the frontend responds.

Stop the stack:

```powershell
docker compose down
```

## Sprint 1 Task Coverage

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

The next implementation step is `SP2-07 Unread Indicators`.
