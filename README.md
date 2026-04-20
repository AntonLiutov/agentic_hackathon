# agentic_hackathon

Classic web chat platform built for the AI Herders Jam requirements.

## What This Project Includes

- user registration, sign in, sign out, persistent sessions, password reset, and password change
- public and private rooms with invitations, room ownership, admin roles, bans, and room deletion
- direct messages with friendship gating and frozen history after user-to-user blocks
- shared message lifecycle for rooms and DMs:
  - send
  - reply
  - edit
  - delete
  - room-admin delete
- file and image attachments with authorization checks
- unread indicators, presence, multi-tab heartbeat, and realtime updates
- session management, account deletion, and owned-room cleanup
- reviewer docs, validation checklist, demo-data guide, and requirements audit

## Reviewer Quick Start

1. Copy `.env.example` to `.env`.
2. Start the stack from the repository root:

```powershell
docker compose up --build
```

3. Seed the demo world in a second terminal:

```powershell
cd apps/api
uv run python scripts/seed_demo_data.py
```

4. Open:
- frontend: `http://localhost:3000`
- API health: `http://localhost:8000/healthz`
- Mailpit: `http://localhost:8025`

5. Sign in as:
- username: `demo.alice`
- password: `demo-chat-pass-2026`

For the shortest reviewer walkthrough:
- [docs/submission-guide.md](docs/submission-guide.md)

For grouped validation:
- [docs/validation-checklist.md](docs/validation-checklist.md)

For seeded scenarios and performance notes:
- [docs/demo-data.md](docs/demo-data.md)

For requirement-by-requirement status:
- [docs/requirements-audit.md](docs/requirements-audit.md)

## Demo Accounts

Seeded users:

- `demo.alice`
- `demo.bob`
- `demo.carol`
- `demo.dave`
- `demo.erin`
- `demo.frank`
- `demo.grace`
- `demo.henry`

Shared password:

- `demo-chat-pass-2026`

## Verification

### Backend

```powershell
cd apps/api
uv run ruff check .
uv run pytest tests -q
```

### Frontend

```powershell
cd apps/web
npm ci
npm run test
npm run build
```

If `npm` is not available locally:

```powershell
docker run --rm -v ${PWD}:/workspace -w /workspace/apps/web node:20-alpine sh -lc "npm ci && npm test && npm run build"
```

### Full Stack

```powershell
docker compose up --build
curl.exe http://localhost:8000/healthz
curl.exe -I http://localhost:3000/healthz
```

Stop the stack:

```powershell
docker compose down
```

## Repository Structure

- `apps/api`: FastAPI backend
- `apps/web`: React + Vite frontend
- `docs`: requirements, audit, reviewer guide, validation, sprint notes

## Submission Scope

Implemented and submission-ready:

- base chat product requirements from sections `1` through `5`
- root `docker compose up` startup flow
- reviewer/demo documentation

Still outside base submission scope:

- XMPP / Jabber integration
- server federation
- Jabber-specific admin dashboards

## Notes

- The API container applies Alembic migrations automatically on startup.
- The demo seeder is safe to rerun for reviewer/demo preparation.
- The current remaining work is mostly UI polish debt rather than missing core chat capability.
