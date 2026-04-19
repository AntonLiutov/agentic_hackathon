# Validation Checklist

This document turns the implemented chat platform into a repeatable validation package for reviewers,
demo runs, and Sprint 4 hardening work.

## Automated Validation

### Backend

Run lint and the full backend suite:

```powershell
cd apps/api
uv run ruff check .
uv run pytest tests -q
```

Optional backend coverage snapshot without changing project files:

```powershell
cd apps/api
uv run --with pytest-cov pytest tests --cov=app --cov-report=term
```

### Frontend

Run the frontend suite locally:

```powershell
cd apps/web
npm ci
npm run test
```

If `npm` is not available locally, run the suite in Docker:

```powershell
docker run --rm -v ${PWD}:/workspace -w /workspace/apps/web node:20-alpine sh -lc "npm ci && npm exec vitest -- run --reporter=basic"
```

Optional frontend coverage snapshot in a throwaway Docker copy:

```powershell
docker run --rm -v ${PWD}:/workspace node:20-alpine sh -lc "cp -R /workspace/apps/web /tmp/web && cd /tmp/web && npm ci && npm install --no-save @vitest/coverage-v8@2.1.9 && npm exec vitest -- run --coverage.enabled true --coverage.provider=v8"
```

### Full stack

```powershell
docker compose up --build
```

Health checks:

```powershell
curl.exe http://localhost:8000/healthz
curl.exe -I http://localhost:3000/healthz
```

Stop the stack:

```powershell
docker compose down
```

## Critical Rule Coverage

| Capability | Primary automated coverage |
|---|---|
| Registration, login, logout, persistent sessions | `apps/api/tests/integration/test_auth.py`, `apps/web/tests/unit/app-routes.test.tsx` |
| Session listing and targeted revocation | `apps/api/tests/integration/test_auth.py`, `apps/web/tests/unit/app-routes.test.tsx` |
| Password reset and password change | `apps/api/tests/integration/test_auth.py`, `apps/web/tests/unit/app-routes.test.tsx` |
| Public/private room access and invitations | `apps/api/tests/integration/test_rooms.py`, `apps/web/tests/unit/app-routes.test.tsx` |
| Room admin rules, remove-member-ban semantics, unban, delete room | `apps/api/tests/integration/test_rooms.py`, `apps/web/tests/unit/app-routes.test.tsx` |
| Direct-message friendship/block gating | `apps/api/tests/integration/test_blocks.py`, `apps/api/tests/integration/test_dms.py`, `apps/web/tests/unit/app-routes.test.tsx` |
| Message lifecycle: reply, edit, delete, room-admin delete | `apps/api/tests/integration/test_messages.py`, `apps/web/tests/unit/message-lifecycle.test.tsx` |
| Infinite history and reconnect recovery | `apps/api/tests/integration/test_messages.py`, `apps/api/tests/integration/test_realtime.py`, `apps/web/tests/unit/message-lifecycle.test.tsx` |
| Unread indicators and read-state clearing | `apps/api/tests/integration/test_messages.py`, `apps/web/tests/unit/app-routes.test.tsx` |
| Presence and multi-tab derivation | `apps/api/tests/unit/test_presence.py`, `apps/api/tests/integration/test_presence_api.py`, `apps/web/tests/unit/app-routes.test.tsx` |
| Friend requests, accept/reject/remove, live social refresh | `apps/api/tests/integration/test_friends.py`, `apps/web/tests/unit/app-routes.test.tsx` |
| Attachments and authorization | `apps/api/tests/integration/test_messages.py`, `apps/web/tests/unit/message-lifecycle.test.tsx` |
| Account deletion, owned-room cleanup, preserved frozen DM history | `apps/api/tests/integration/test_auth.py`, `apps/api/tests/integration/test_realtime.py`, `apps/web/tests/unit/app-routes.test.tsx` |

## Fresh Environment Validation

Use this sequence when validating from a reviewer-style clean environment:

1. Copy `.env.example` to `.env`.
2. Run `docker compose up --build` from the repository root.
3. Confirm the frontend, API, and Mailpit are reachable.
4. Register a new user and confirm the first authenticated session is created.
5. Run the manual workflow groups below.

## Manual Workflow Groups

### Authentication and sessions

1. Register a user.
2. Sign out and sign back in.
3. Open the same account in a second browser or private window.
4. Revoke the second session from `/app/sessions`.
5. Change the password from `/app/profile`.
6. Use `/forgot-password` and Mailpit to finish the reset flow.

### Rooms and moderation

1. Create one public room and one private room.
2. Join the public room from another account.
3. Invite the other account into the private room and accept the invitation.
4. Promote and demote admins.
5. Remove a member and confirm that removal behaves like a ban.
6. Unban the user and confirm they can rejoin.

### Messaging and realtime

1. Send, reply to, edit, and delete messages in a room.
2. Repeat the same lifecycle in a DM.
3. Load older messages and confirm prepend behavior.
4. Open the same room or DM in two clients and confirm live create/edit/delete updates.
5. Refresh or reconnect one client and confirm the active conversation resyncs correctly.

### Social graph

1. Send a friend request by username.
2. Accept it from the recipient account.
3. Open a DM from the friend list.
4. Block the counterpart and confirm the DM becomes frozen.
5. Unblock and confirm messaging still depends on friendship state.

### Attachments and account deletion

1. Upload an image and a generic file in a room.
2. Upload an attachment in a DM.
3. Confirm unauthorized room/DM attachment access is denied from the wrong account.
4. Delete an account from `/app/profile`.
5. Confirm owned rooms disappear permanently and surviving DMs remain visible as frozen history.

## Coverage Snapshot

The current measured coverage snapshot during Sprint 4 validation was:

| App | Coverage |
|---|---|
| `apps/api` | `69%` total line coverage |
| `apps/web` | `79.08%` statements / `79.85%` branches / `71.61%` functions / `79.08%` lines |

This snapshot should be treated as informational. Re-run the commands above when you need a fresh measurement.
