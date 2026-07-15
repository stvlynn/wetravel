# Trip agent

The non-intrusive AI companion described in
[../decisions/0005-trip-agent.md](../decisions/0005-trip-agent.md). One shared
session per trip; every member talks in the same timeline, and the agent stays
quiet unless asked or a change carries a material planning risk.

## Session model

- `agent_messages` is the single timeline per trip: member chat, `@agent`
  mentions, operation events (`source = operation`), and agent replies.
  Stop-comment `@agent` threads use `source = stop_comment` and are rendered
  in StopDetail (not the agent drawer); the ambient reply is also persisted
  on the stop as a comment with `author = agent`.
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
| Explicit chat with `@agent` | `POST …/agent/chat` | Streams a reply (AI SDK UI message stream). User and assistant rows are persisted with the **same UIMessage ids** the client `useChat` buffer uses, so the panel can dedupe live vs history while streaming. Write tools are available (with approval). |
| Agent-thread follow-up (e.g. “确认”) | `POST …/agent/chat` (client) | The web client routes short confirmations and other continuations after an assistant turn to the same streaming chat path so write tools can run. Without this, ambient replies are read-only and cannot `insertStop`. |
| Plain member message | `POST …/agent/messages` | Persists the message, then asks whether the agent was addressed (thread follow-ups after an agent turn count; explicit `@agent` or an AI-judged ask also). Ambient reply runs in the background (lands via polling); pure member-to-member chatter stays silent. Ambient replies use **read tools only**. |
| `@agent` or `@Member` in a stop comment | `POST …/stops/:stopId/comments` | Mirrored into the shared session with the stop as context (`source = stop_comment`). `@Member` mentions populate `mentionedUserIds` so the same client toast path as chat fires. Ambient agent reply runs **only** when `@agent` is present; the reply is written into that stop's comment thread (`author = agent`) and is **not** shown in the agent drawer |
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
| `airbnbSearch` | none (auto) | Airbnb vacation-rental search via `LodgingService` |
| `airbnbListingDetails` | none (auto) | Airbnb listing amenities/rules/description |
| `readTripMedia` | none (auto) | Read a trip-owned upload (image/PDF/text) via AI SDK `toModelOutput`; URL must be this trip’s `/api/uploads/trips/…` path |
| `streetViewSearch` | none (auto) | Find normalized street-level imagery; `toModelOutput` adds trusted captions + at most one static preview |
| `streetViewInspect` | none (auto) | Supply one bounded ordinary static preview for another search id; panorama inspection is rejected |
| *(from registry)* | `user-approval` | All trip-scoped editor mutations (`renameTrip`, `insertStop`, …) |

Geo and lodging tools are read-only and do not mutate trips. Adding a discovered
place or stay still uses `insertStop` (and approval). Provider selection and
caching for geo are documented in [geo.md](./geo.md); lodging (Airbnb scrape) in
[lodging.md](./lodging.md).

Street-view tools are provider-neutral; Mapillary is isolated behind the
`StreetViewProvider` adapter. `appendStopNote` is approval-gated and appends
inside the aggregate instead of replacing truncated prompt context. See
[street-view.md](./street-view.md).

### Itinerary planning workflow

When a member asks the agent to create or fill a multi-day plan, the chat
system prompt requires:

1. **Research with tools** — `placeSearch` / `placeNearby` / `placeDetail` for
   sights and food, `airbnbSearch` for lodging, `checkWeather` for dates,
   routes when travel time matters. Do not invent POIs without tools.
2. **Draft + ask** — present a day-by-day proposal and ask whether to write it
   into the trip (e.g. reply “确认”). No write tools on that proposal turn.
3. **Confirm → write** — on member confirmation, call `updateDay` /
   `insertStop` (Stay / Sight / Food, etc.) with coords and names from tool
   results; approval UI still gates each write. Put estimated prices (tickets,
   lodging, meals) in the stop **note**, not via `addExpense`. Only call
   `addExpense` when the member explicitly asks to record a spend.

`AI_MAX_TOOL_STEPS` defaults to 16 so a multi-day plan can finish research and
writes in one turn.

### Multimodal (AI SDK file parts)

- Members can attach **PNG / JPEG / WebP / PDF / plain text** (markdown, csv)
  in the agent composer (max 2 MiB, same as trip note media).
- Files are uploaded to `POST /api/trips/:id/media` first; chat messages persist
  AI SDK `{ type: "file", mediaType, url, filename? }` parts (never `data:` URLs).
- Before calling the model, trip-owned upload URLs are resolved to **inline
  bytes** via `FileStorage` (and `experimental_download` for any remaining URL
  parts). AI SDK’s default HTTP downloader blocks `localhost`/private hosts
  (SSRF guard); we never ask it to fetch our own upload URLs over the network.
- Stop `note` Markdown (truncated) is included in the trip snapshot so the agent
  can discover existing upload URLs and call `readTripMedia` when needed.
- External URLs are rejected by `readTripMedia` and by the custom download
  helper (SSRF protection).

Write tools use AI SDK `toolApproval` + `experimental_toolApprovalSecret`. The
client continues with `addToolApprovalResponse({ id, approved, reason? })` and
`sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`.
`execute` calls `applyTripOp` → Trip aggregate + repository.

**Same-turn multi-tool writes:** AI SDK may invoke several approved write tools
in parallel. `AgentService.streamChat` serializes them on one in-memory `Trip`
for the request (`createSequentialTripPatchApplier`): load editable once, apply
each patch on that aggregate, echo `toTripDto(working)` — do **not**
`findById` between patches. Hyperdrive can serve a stale SELECT for ~60s after
a write; reloading would make later tool results look like earlier days/stops
“rolled back,” and a full-trip SPA `setQueryData` would wipe the UI. The client
additionally merges each echo by op (`mergeTripToolEcho`) so only the mutated
day/stop/expense overlays the planner cache.

Ambient threshold replies use **read tools only** (no approval loop) and a
**separate ambient system prompt** so the model is not told it has write tools.
That prompt must not claim tools are “broken/unavailable”; if a write is needed
it asks the member to continue with `@agent`. The web client therefore sends
agent-thread follow-ups (confirmations, short continuations) through
`POST …/agent/chat` so write tools remain available.
Every plain member message is still evaluated with `isAddressed` for ambient
replies when the client uses `POST …/messages`. Continuations of an agent turn
— short confirmations like “确认”, choices, or follow-up questions right after
an assistant message — are treated as addressed even without `@agent`
(deterministic heuristic first, then the model). There is no message-count
threshold.

There is no product API for deleting a stop or expense yet. Invites and votes
stay human-only. Stop comments are human-authored except for agent replies that
land in the same thread after an explicit `@agent` mention.

### Generative UI (json-render)

Explicit streaming chat can combine prose, reasoning, tools, and a compact
native interface. The AI adapter appends the shared json-render catalog prompt
in inline mode, converts AI SDK 7 `streamText().stream` with
`toUIMessageStream`, and passes the result through `pipeJsonRender`. Non-text
tool/approval/reasoning chunks pass through unchanged; SpecStream JSONL patches
become persisted `data-spec` UI message parts.

The framework-neutral catalog lives in `packages/agent-ui-catalog` and is
shared by API and web. It owns json-render's Zod 4 boundary while the API keeps
its existing Zod 3 request schemas. The initial catalog is deliberately bounded
to trip plan cards, text, badges, alerts, day/stop summaries, comparisons,
budget estimates, and action buttons.

Generated actions cannot call arbitrary URLs or APIs. Only a user press on an
`ActionButton` may send an agent follow-up or focus an existing day/stop. A
request to write a plan still enters the normal generated trip tool, AI SDK
approval, `applyTripOp`, aggregate, and repository path. Automatic watchers,
action chaining, unknown components/actions, dynamic repeats, oversized specs,
and invalid props are rejected by the shared runtime sanitizer.

All UI parts are stored with the normal message parts. They are never flattened
into assistant prose for later turns: mixing a persisted flat spec with inline
SpecStream instructions can make providers echo internal UI context as text.
Fresh requests therefore receive only prior assistant prose. When the latest
member message explicitly asks to edit a recent generated card, the adapter
uses json-render's `buildUserPrompt({ currentSpec, editModes: ["patch"] })`
refinement format and seeds the new UI message with the validated base spec
before streaming patches. Specs are size-bounded, limited to the recent thread,
and street-view cards are excluded because their image ids must be grounded by
a successful tool output in the same new assistant message. An unchanged seed
is not persisted as a duplicate card. A UI-only assistant reply counts as
content and is persisted; invalid UI falls back to accompanying text.

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
  (Vercel AI SDK adapter; OpenAI, OpenAI-compatible via `AI_BASE_URL`, or
  MiniMax via Anthropic-compatible API when `AI_PROVIDER=minimax`) and
  `apps/api/src/infrastructure/persistence/agent-repository.pg.ts` (raw `pg`).
- Interfaces: agent sub-router in `apps/api/src/interfaces/http/app.ts`;
  routes return `404` when AI is not configured. Post-response work
  (evaluations, ambient replies, stream persistence) uses
  `executionCtx.waitUntil` on Workers and a floating promise on Node.

Agent calls emit AI SDK 7 OpenTelemetry spans beneath application-owned
`opentrip.agent.*` spans. The initiating user UI message id is reused as the
turn id across tool-approval continuations. Generated street-view UI accepts
only image ids grounded by a successful tool output in the same assistant
message. Each message exposes a localized “Copy debug info” action containing
safe correlation ids and a text fingerprint. Structured logs and the debugging
runbook are documented in
[../operations/observability.md](../operations/observability.md).

## Configuration

Set in the root `.env` (see [.env.example](../../.env.example)); the agent is
disabled unless both `AI_MODEL` and `AI_API_KEY` are present.

| Variable | Meaning | Default |
| --- | --- | --- |
| `AI_PROVIDER` | `openai`, `minimax`, or a label for OpenAI-compatible | `openai` |
| `AI_MODEL` | Model id (required), e.g. `MiniMax-M2.7` | — |
| `AI_BASE_URL` | Provider base URL. Empty: OpenAI API, or MiniMax `…/anthropic/v1` when `AI_PROVIDER=minimax` | — |
| `AI_API_KEY` | API key (required) | — |
| `AI_PROACTIVE_THRESHOLD` | Minimum confidence for a proactive suggestion | `0.7` |
| `AI_MAX_TOOL_STEPS` | Tool-step cap per chat generation | `16` |

### MiniMax

Set `AI_PROVIDER=minimax` and `AI_MODEL` to a supported id (`MiniMax-M2.7`,
`MiniMax-M3`, …). Leave `AI_BASE_URL` empty to use
`https://api.minimaxi.com/anthropic/v1` (Anthropic-compatible). That path
streams `thinking` blocks as AI SDK `reasoning` parts so the panel can render
them in `AgentReasoning`.

`@ai-sdk/anthropic` appends `/messages` to `baseURL`, so the prefix **must**
include `/v1` (same default as
[vercel-minimax-ai-provider](https://ai-sdk.dev/providers/community-providers/minimax):
`https://api.minimax.io/anthropic/v1`). A bare `…/anthropic` value is normalized
to `…/anthropic/v1`. Using a generic OpenAI-compatible MiniMax URL mixes
thinking into plain text and does not produce separate reasoning chunks.

For `MiniMax-M3`, the adapter sends
`providerOptions.anthropic.thinking = { type: "adaptive" }` (M3 defaults
thinking off). M2.x models always emit thinking.

See [MiniMax AI SDK docs](https://platform.minimaxi.com/docs/api-reference/text-ai-sdk)
and the [AI SDK MiniMax provider](https://ai-sdk.dev/providers/community-providers/minimax).

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
`addToolApprovalResponse`. Plain (non-`@agent`) sends use
`POST …/agent/messages`, which returns the inserted `message`; the SPA merges
it with `setQueryData` so the bubble appears immediately without relying on a
list GET that may hit a stale Hyperdrive cache (same write-echo rule as trip
create — [../frontend/data-caching.md](../frontend/data-caching.md)). Explicit
`@agent` / stream turns use the same rule on settle: write-echo the live
`UIMessage`s (same ids the server persists) into `queryKeys.agentMessages`,
then clear the `useChat` buffer — **never** `invalidateQueries(agentMessages)`
on settle, because Workers may still be in `onFinish` after the client SSE
closes. Approved write tools return `{ ok, summary, trip }` (in-memory
`TripDto`, not a re-`SELECT`); the SPA merges each echo by tool op into
`queryKeys.trip` and must **not** `invalidateQueries(trip)` after stream
settle or agent-events polls — that path was wiping freshly added stops in
production. Avatars resolve members by
`actorUserId` (not display name) so duplicate names stay distinct. The
collapsed state persists via
`PUT /api/users/preferences/agent-panel` (response is the written preference
snapshot — not a post-write re-read; see
[../operations/cloudflare.md](../operations/cloudflare.md#hyperdrive-read-after-write)).

On Workers, Better Auth and `SqlAgentSessionRepository` use the
`HYPERDRIVE_CACHE_DISABLED` binding (`poolFresh`) so history/events polls see
fresh rows after writes. Deferred ambient replies **and** streaming chat
`onFinish` persistence are tracked on the container and finish before
`pool.end()` (`disposeAfterDeferred`). Without holding the pool for the SSE
lifetime, `appendMessage` fails with `Cannot use a pool after calling end on
the pool`. The SPA must still write-echo on stream settle (above): client SSE
can finish before `onFinish`, so an immediate history refetch would miss the
assistant row even when the pool stay-open fix succeeds.
