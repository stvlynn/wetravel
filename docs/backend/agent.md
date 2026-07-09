# Trip agent

The non-intrusive AI companion described in
[../decisions/0005-trip-agent.md](../decisions/0005-trip-agent.md). One shared
session per trip; every member talks in the same timeline, and the agent stays
quiet unless asked or a change carries a material planning risk.

## Session model

- `agent_messages` is the single timeline per trip: member chat, `@agent`
  mentions, operation events (`source = operation`), and agent replies.
- `agent_suggestions` stores AI-proposed patches with `status`
  (`pending | applied | stale | expired`), the model's `severity`/`confidence`/
  `reason`, and the `trip_version` the patch was computed against.
- `agent_suggestion_dismissals` hides a suggestion's toast per user; the shared
  record and other members' toasts are unaffected.
- `trips.version` is bumped by every persisted mutation
  (`PgTripRepository`), so an apply can detect that a patch went stale.

## Triggers

| Trigger | Path | Behavior |
| --- | --- | --- |
| Explicit chat with `@agent` | `POST …/agent/chat` | Streams a reply (AI SDK UI message stream). User and assistant rows are persisted with the **same UIMessage ids** the client `useChat` buffer uses, so the panel can dedupe live vs history while streaming |
| Plain member message | `POST …/agent/messages` | Persists the message, then asks the model whether the agent was addressed. Explicit `@agent` or an AI-judged ask triggers an ambient reply in the background (lands via polling); member-to-member chatter stays silent |
| `@agent` in a stop comment | `POST …/stops/:stopId/comments` | Detected server-side; recorded as a mention with the stop as context, answered ambiently |
| Whitelisted write operation | stop insert/update/move, day update/delete/reorder, expense add/update | Recorded as an operation event, then evaluated asynchronously |

## Intervention policy

Operation evaluation uses `generateObject` with a structured
`InterventionDecision` schema (`shouldNotify`, `severity`, `confidence`,
`reason`, `suggestion`, `pendingPatch`, `expiresInMinutes`). The system prompt
restricts notifications to material risks: impossible timing, duplicate or
conflicting stops, weather/season conflicts, avoidable backtracking, and
inconsistent budget entries.

- `shouldNotify && confidence >= AI_PROACTIVE_THRESHOLD && pendingPatch` →
  an assistant message plus a `pending` suggestion; members see a toast via
  polling.
- `shouldNotify` below the threshold → a quiet observation line in the
  timeline, no toast.
- Otherwise → nothing.

`PendingPatch` is a discriminated union limited to operations the Trip
aggregate already supports: `update_stop`, `move_stop`, `update_day`,
`reorder_days`, `update_expense`.

### Chat tools (Vercel AI SDK)

Write tools are **generated** from the trip ops registry
([trip-ops.md](./trip-ops.md)) — not hand-listed in the AI adapter. Adding a
trip CRUD op means extending `TRIP_OPS` once; agent tools, `toolApproval`, and
proactive `pendingPatch` stay in sync.

| Tool | Approval | Purpose |
| --- | --- | --- |
| `checkWeather` | none (auto) | Read forecast via `WeatherService` (same as `GET /api/weather`; not in trip ops registry). See [weather.md](./weather.md) |
| `placeSearch` | none (auto) | Free-text place search via `GeoService` |
| `placeNearby` | none (auto) | Nearby POIs via `GeoService` |
| `placeDetail` | none (auto) | Place enrichment via `GeoService` |
| `routeCompute` | none (auto) | Route between waypoints via `GeoService` |
| `routeMatrix` | none (auto) | Travel-time matrix via `GeoService` |
| `reviewLookup` | none (auto) | Place reviews when the geo provider supports them |
| *(from registry)* | `user-approval` | All trip-scoped editor mutations (`renameTrip`, `insertStop`, …) |

Geo tools are read-only and do not mutate trips. Adding a discovered place still
uses `insertStop` (and approval). Provider selection and caching are documented
in [geo.md](./geo.md).

Write tools use AI SDK `toolApproval` + `experimental_toolApprovalSecret`. The
client continues with `addToolApprovalResponse({ id, approved, reason? })` and
`sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`.
`execute` calls `applyTripOp` → Trip aggregate + repository.

Ambient threshold replies use **read tools only** (no approval loop). Every
plain member message is evaluated with `isAddressed`; the agent replies only
when it judges itself addressed (or when `@agent` is explicit). There is no
message-count threshold.

There is no product API for deleting a stop or expense yet. Invites, votes, and
stop comments stay human-only.

## Approving a suggestion

Proactive suggestions use the same approval DTO as AI SDK tools:

```json
{ "id": "<suggestionId>", "approved": true, "reason": "optional" }
```

`POST …/suggestions/:id/approve` with `approved: true` runs
`applySuggestion` through the normal domain path:

1. `loadEditable` — membership + edit permission (viewers get `403`).
2. Reject non-pending (`409`), expired (`409`, marked `expired`), and
   version-mismatched suggestions (`409`, marked `stale`).
3. Claim with `UPDATE … WHERE status = 'pending'` so concurrent applies are
   first-come-first-served.
4. Execute the patch via the Trip aggregate and repository (which bumps
   `trips.version`), then record the approve in the session. The write is
   attributed to the approving user.

`approved: false` dismisses the toast for that user only (same as legacy
dismiss). `POST …/apply` and `…/dismiss` remain as aliases.

## Architecture

- Domain: `apps/api/src/domain/agent/` — types plus the
  `AgentSessionRepository` and `AgentModel` ports.
- Application: `apps/api/src/application/agent/agent-service.ts` — use cases,
  permission checks mirroring `TripService`, and the apply/conflict rules.
- Infrastructure: `apps/api/src/infrastructure/ai/agent-model.ai-sdk.ts`
  (Vercel AI SDK adapter; OpenAI or any OpenAI-compatible endpoint via
  `AI_BASE_URL`) and
  `apps/api/src/infrastructure/persistence/agent-repository.pg.ts` (raw `pg`).
- Interfaces: agent sub-router in `apps/api/src/interfaces/http/app.ts`;
  routes return `404` when AI is not configured. Post-response work
  (evaluations, ambient replies) uses `executionCtx.waitUntil` on Workers and a
  floating promise on Node.

## Configuration

Set in the root `.env` (see [.env.example](../../.env.example)); the agent is
disabled unless both `AI_MODEL` and `AI_API_KEY` are present.

| Variable | Meaning | Default |
| --- | --- | --- |
| `AI_PROVIDER` | Provider label; also names the OpenAI-compatible provider | `openai` |
| `AI_MODEL` | Model id (required) | — |
| `AI_BASE_URL` | OpenAI-compatible base URL; empty uses the OpenAI API | — |
| `AI_API_KEY` | API key (required) | — |
| `AI_PROACTIVE_THRESHOLD` | Minimum confidence for a proactive suggestion | `0.7` |
| `AI_MAX_TOOL_STEPS` | Tool-step cap per chat generation | `5` |

On Cloudflare, set the same variables as Worker vars/secrets (see
[../operations/cloudflare.md](../operations/cloudflare.md)).

## Frontend

The planner page hosts the panel (see
[../frontend/layers.md](../frontend/layers.md)): a sparkle toggle in the
top-right corner mirroring the left sidebar control, a right agent panel (a
`bg-sidebar` base layer mirroring the left sidebar, revealed by a width
transition) with `useChat` + `DefaultChatTransport` for streaming (full message list so tool
approvals round-trip), a 12-second poll of `GET …/agent/events` shared by all
members, and bottom-right intervention cards with approve / discuss / deny
actions (AI SDK approval DTO). Chat tool parts render Approve/Deny via
`addToolApprovalResponse`. The collapsed state persists via
`PUT /api/users/preferences/agent-panel`.
