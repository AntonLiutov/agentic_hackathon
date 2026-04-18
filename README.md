# agentic_hackathon

Classic web chat platform built for the AI Herders Jam requirements.

## Current Status

Sprint 1 foundation work is in progress. The repository now includes:

- planning and architecture docs
- backend and frontend application skeletons
- root Docker Compose orchestration
- health checks and example environment configuration

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
npm install
npm run test
```

### Full Stack

Start the full application:

```powershell
docker compose up --build
```

Basic checks after startup:

1. Open `http://localhost:3000` and confirm the foundation page loads.
2. Open `http://localhost:8000/healthz` and confirm the API returns `status: ok`.
3. Open `http://localhost:3000/healthz` and confirm the web container health endpoint responds.

Stop the stack:

```powershell
docker compose down
```

## Sprint 1 Task Coverage

This repository currently targets:

- `SP1-01 Repository and Delivery Skeleton`

The next implementation steps are backend foundation, frontend foundation, and core schema work.
