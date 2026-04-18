# Working Agreement

## Git Workflow Rules

These rules apply unless the user explicitly changes them.

1. Never commit without explicit user approval.
2. Never push without explicit user approval.
3. Never merge branches without explicit user approval.
4. Open a pull request for review before merge.
5. Always prepare a PR title and PR description when a branch is ready.
6. Start each new task on a new branch created from the appropriate base branch.
7. Do not make surprise git state changes. Explain the intended git action before running it.

## Execution Rules

1. Keep work scoped to the active sprint task unless the user approves expansion.
2. Prefer vertical slices when implementing product features.
3. Treat security and permission checks as first-class requirements.
4. Preserve a runnable repository state after each completed task.
5. Document important architecture or workflow decisions in the repository.
6. Before asking for commit or PR approval, run the relevant local verification for the task.
7. Do not describe code as working unless it has been verified by running it locally.

## Quality Standards

1. Match implementation to the written specification, not just a demo path.
2. Favor clear, maintainable structure over clever shortcuts.
3. Add validation for important behavior through tests or explicit manual checks.
4. Protect access-controlled resources on the backend, not only in the UI.
5. Avoid duplicating business logic across room and DM flows when one abstraction is enough.
6. Every new feature should add or extend automated tests unless there is a clear temporary blocker.
7. Tests should live in the appropriate project structure near the code they validate.

## Delivery Standards

1. The repository root must remain compatible with `docker compose up`.
2. New environment variables must be documented in example env files.
3. New services should expose clear health checks when practical.
4. User-facing work should be easy to demo after each milestone.
5. A task is not ready for PR review until the relevant tests have been run and reported.
