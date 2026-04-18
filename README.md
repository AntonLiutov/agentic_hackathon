# agentic_hackathon

Classic web chat platform built for the AI Herders Jam requirements.

## Current Status

Sprint 1 foundation work is in progress. The repository now includes:

- planning and architecture docs
- backend and frontend application skeletons
- root Docker Compose orchestration
- health checks and example environment configuration
- frontend route skeleton for landing, auth, and workspace flows
- working registration, login, session bootstrap, and logout flows
- active session listing and targeted session revocation
- password change and email-based password reset flow

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
10. Use the workspace sign-out action and confirm protected routes redirect back to `/signin`.
11. Open `http://localhost:8000/healthz` and confirm the API returns `status: ok`.
12. Open `http://localhost:3000/healthz` and confirm the web container health endpoint responds.

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

The next implementation step is Sprint 2: conversations, rooms, history, and realtime messaging.
