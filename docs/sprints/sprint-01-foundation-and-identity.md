# Sprint 1: Foundation and Identity

## Sprint Goal

Create a runnable product skeleton with stable local infrastructure, the base data model, and complete identity/session foundations that all later realtime work depends on.

## Scope

### SP1-01 Repository and Delivery Skeleton

- create monorepo structure for `apps/api` and `apps/web`
- add root `docker-compose.yml`
- add shared environment strategy and example env files
- add healthcheck endpoints and service startup docs

Acceptance criteria:

- project starts with `docker compose up`
- API and web containers build successfully
- health endpoints are reachable

### SP1-02 Backend Foundation

- initialize FastAPI app structure
- initialize SQLAlchemy and Alembic
- initialize Redis integration layer
- establish configuration and secret loading

Acceptance criteria:

- migrations can be created and applied
- app boots with database and Redis connectivity
- base settings load cleanly in Docker

### SP1-03 Frontend Foundation

- initialize React + TypeScript + Vite app
- create route skeleton for auth and app shell
- establish API client, auth bootstrap, and UI state conventions
- set up basic layout primitives matching the wireframe direction

Acceptance criteria:

- frontend runs in Docker
- frontend can call backend health endpoint
- route structure is ready for auth and chat views

### SP1-04 Core Schema

- create schema for users, credentials, sessions
- create schema for conversations, room metadata, memberships
- create schema for messages, attachments, read state
- create schema for friend requests, friendships, blocks, bans, invitations

Acceptance criteria:

- initial migration covers all major entities
- schema matches architecture assumptions
- no duplicate modeling for room and DM conversations

### SP1-05 Registration and Login

- register with email, username, password
- login with email and password
- current-user endpoint
- logout current session

Acceptance criteria:

- email and username uniqueness are enforced
- username immutability is preserved
- passwords are stored hashed
- logout invalidates only the current browser session

### SP1-06 Persistent Sessions

- secure session cookie flow
- remember-me or persistent-session semantics
- active sessions listing
- revoke selected sessions

Acceptance criteria:

- login survives browser restart
- sessions list shows browser and IP metadata
- revoking one session does not invalidate others

### SP1-07 Password Management

- password change for logged-in users
- password reset request and token validation
- reset completion flow

Acceptance criteria:

- a user can change password while authenticated
- password reset flow works in local demo mode
- old invalidated credentials no longer authenticate after reset

## Dependencies

- no later sprint starts without `SP1-04`
- realtime messaging depends on `SP1-05` and `SP1-06`
- account deletion implementation later depends on the core identity schema from this sprint

## Risks

- session model mistakes will ripple through every protected feature
- overcomplicated auth now will slow the whole project later

## Exit Criteria

At sprint end, a user can register, log in, stay logged in, view active sessions, revoke a session, and the entire stack runs through Docker.
