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

### Local performance probe

After seeding the demo world, run the local performance probe against the running stack:

```powershell
cd apps/api
uv run python scripts/measure_local_performance.py --concurrent-fetches 300
```

Measured local results during Sprint 4:

| Probe | Result |
|---|---|
| Recent fetch from `demo-history-lab` at `100,000` messages | `p95 83.81ms` |
| Older-page fetch from `demo-history-lab` at `100,000` messages | `p95 63.65ms` |
| `300` concurrent history fetches | completed successfully in `12,424.4ms` total wall time |
| Room message delivery latency | `p95 159.36ms` |
| DM message delivery latency | `p95 102.3ms` |
| Presence propagation latency | `p95 77.72ms` |

These results are environment-specific, but they provide practical local evidence for:

- very large history usability
- sub-3-second local message delivery
- sub-2-second local presence propagation
- a moderate concurrent fetch workload completing successfully on the seeded dataset

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
3. Seed the standard demo world:

   ```powershell
   cd apps/api
   uv run python scripts/seed_demo_data.py
   ```

4. Confirm the frontend, API, and Mailpit are reachable.
5. Sign in as one of the seeded demo users or register a new user if you want to test onboarding from scratch.
6. Run the manual workflow groups below.

For heavier history validation, optional measured seed runs during Sprint 4 were:

| History messages | Chunk size | History insert time | Total seed time | Effective throughput |
|---|---:|---:|---:|---:|
| `250` | `100` | `0.099s` | `1.668s` | `157.63 msg/s` |
| `20,000` | `1000` | `6.624s` | `8.129s` | `2461.97 msg/s` |
| `100,000` | `2000` | `51.249s` | `69.286s` | `1443.47 msg/s` |

## Manual Workflow Groups

### Authentication and sessions

1. Register a user.
2. Sign out and sign back in.
3. Open the same account in a second browser or private window.
4. Revoke the second session from `/app/sessions`.
5. Change the password from `/app/profile`.
6. Use `/forgot-password` and Mailpit to finish the reset flow.

### Rooms and moderation

1. Open `demo-general`.
2. Sign in as another seeded account and join or interact with the public room state.
3. Open `demo-leadership` and verify the pending invitation state.
4. Promote and demote admins.
5. Remove a member and confirm that removal behaves like a ban.
6. Unban the user and confirm they can rejoin.

### Messaging and realtime

1. Send, reply to, edit, and delete messages in `demo-general`.
2. Repeat the same lifecycle in a seeded DM.
3. Open `demo-history-lab`, use `Load older messages`, and confirm prepend behavior across a long seeded history.
4. Open the same room or DM in two clients and confirm live create/edit/delete updates.
5. Refresh or reconnect one client and confirm the active conversation resyncs correctly.

### Social graph

1. Review the seeded friends and pending request state.
2. Accept or reject the pending request from the recipient account.
3. Open a DM from the friend list.
4. Review the frozen DM with `demo.frank`.
5. Unblock or re-friend only if you intentionally want to mutate the seeded dataset.

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
