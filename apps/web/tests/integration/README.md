# Frontend Integration Tests

This directory is reserved for browser-level or route-level integration tests.

Current frontend validation still relies primarily on:

- `tests/unit/app-routes.test.tsx` for route-spanning authenticated workspace flows
- `tests/unit/message-lifecycle.test.tsx` for realtime, history, composer, and attachment flows
- `tests/unit/api-client.test.ts` for shared API client behavior

That means the repository already has higher-level route coverage, but it currently lives in the
unit suite for pragmatic speed and setup reasons.

Use [docs/validation-checklist.md](../../../docs/validation-checklist.md) as the source of truth
for:

- full-suite validation commands
- optional coverage measurement commands
- manual reviewer/demo workflow checks

Future browser-level tests can move into this directory when we need true end-to-end automation
beyond the current route-level coverage.
