# Demo Data

Sprint 4 includes a deterministic demo-data seeding path so the app can be reviewed as a populated
chat product instead of an empty shell.

## Seed command

From the repository root:

```powershell
cd apps/api
uv run python scripts/seed_demo_data.py
```

The command:

- removes the previous demo dataset by default
- creates a stable set of demo users, rooms, DMs, friendships, a pending friend request, a block,
  a pending private-room invitation, attachments, and unread state
- creates a large-history room for pagination demos

## Demo accounts

Seeded users:

- `demo.alice`
- `demo.bob`
- `demo.carol`
- `demo.dave`
- `demo.erin`
- `demo.frank`
- `demo.grace`
- `demo.henry`

Shared password for all demo users:

- `demo-chat-pass-2026`

Emails follow the pattern:

- `<username>@demo.agentic.chat`

Example:

- `demo.alice@demo.agentic.chat`

## Seeded scenarios

The seed creates:

- `demo-general`
  - public room
  - active membership
  - admin ownership/moderation
  - one banned user
  - attachment examples
  - edited/deleted message states
- `demo-history-lab`
  - public room
  - high-volume history for pagination checks
- `demo-leadership`
  - private room
  - pending invitation for governance review
- active DMs:
  - `demo.alice` <-> `demo.bob`
  - `demo.alice` <-> `demo.carol`
- frozen DM:
  - `demo.alice` <-> `demo.frank`
- social graph examples:
  - accepted friendships
  - one pending friend request
  - one user block

## Large-history options

The default history-lab room gets `5000` messages.

To seed a smaller or larger dataset:

```powershell
cd apps/api
uv run python scripts/seed_demo_data.py --large-history-count 20000
```

For a heavier local stress pass:

```powershell
cd apps/api
uv run python scripts/seed_demo_data.py --large-history-count 100000 --history-chunk-size 2000
```

That larger run is optional. It exists to give us at least one validation path for very old,
progressively loaded room history when the local machine can handle it comfortably.

## Measured seed runs

The seeder now reports practical timing metrics as part of its summary. Measured local runs during
Sprint 4 produced:

| History messages | Chunk size | History insert time | Total seed time | Effective throughput |
|---|---:|---:|---:|---:|
| `250` | `100` | `0.099s` | `1.668s` | `157.63 msg/s` |
| `20,000` | `1000` | `6.624s` | `8.129s` | `2461.97 msg/s` |
| `100,000` | `2000` | `51.249s` | `69.286s` | `1443.47 msg/s` |

These numbers are environment-specific, but they prove that the deterministic seed path remains
usable for:

- a quick small demo run
- a medium large-history validation run
- a heavier local stress pass

## Local performance probe

After seeding the demo world and starting the stack, you can probe the live local API:

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

These results are environment-specific, but they give us a practical reviewer/demo proof that the
seeded large-history room and realtime surfaces stay responsive on the local stack.

## Suggested demo flow

1. Seed the data.
2. Sign in as `demo.alice`.
3. Open `demo-general` for moderation, attachments, and live room examples.
4. Open `demo-history-lab` and use `Load older messages` to show large-history paging.
5. Open `/app/contacts` to show:
   - existing friends
   - pending friend request
   - frozen DM history with `demo.frank`
6. Sign in as `demo.bob` or `demo.grace` in another browser/private window to demonstrate:
   - room membership
   - unread changes
   - live updates
   - pending private-room invitation behavior
