# Submission Guide

This guide is the shortest path for a reviewer to clone the repository, start the stack, seed a
realistic demo world, and verify the core product quickly.

## Reviewer Quick Start

1. Copy `.env.example` to `.env`.
2. Start the stack from the repository root:

   ```powershell
   docker compose up --build
   ```

3. Wait for the services to become healthy.
   The API container runs Alembic migrations automatically during startup.
4. In a second terminal, seed the demo world:

   ```powershell
   cd apps/api
   uv run python scripts/seed_demo_data.py
   ```

5. Open:
   - frontend: `http://localhost:3000`
   - API health: `http://localhost:8000/healthz`
   - Mailpit: `http://localhost:8025`

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

## Five-Minute Review Path

1. Sign in as `demo.alice`.
2. Open `demo-general` and verify:
   - normal room messaging
   - reply/edit/delete flow
   - attachment rendering
   - moderation surfaces
3. Open `demo-history-lab` and use `Load older messages`.
4. Open `/app/contacts` and verify:
   - friends
   - pending request state
   - frozen DM with `demo.frank`
5. Open a second browser/private window as `demo.bob` or `demo.grace` to verify:
   - live updates
   - unread changes
   - invitation/member behavior

## Health and Validation

Basic checks:

```powershell
curl.exe http://localhost:8000/healthz
curl.exe -I http://localhost:3000/healthz
```

For the full grouped validation path:

- `docs/validation-checklist.md`

For seeded scenarios and measured demo-data/performance runs:

- `docs/demo-data.md`

For the requirement-by-requirement implementation audit:

- `docs/requirements-audit.md`

## Scope Note

Core chat requirements are implemented through Sprint 4 submission readiness work.

Still outside the core submission scope:

- final UI polish pass
- XMPP / federation stretch requirements
