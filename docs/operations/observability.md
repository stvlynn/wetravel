# Observability and agent tracing

OpenTrip uses two complementary observability surfaces:

- Cloudflare Workers Logs or Docker stdout contain newline-delimited JSON logs.
- Sentry contains request traces, errors, and AI SDK 7 OpenTelemetry spans.

Sentry is disabled when `SENTRY_DSN` is absent. Observability failures never
disable the API or trip agent.

## Configuration

| Key | Kind | Purpose |
| --- | --- | --- |
| `SENTRY_DSN` | secret | Enables Sentry in the API runtime |
| `SENTRY_AUTH_TOKEN` | CI-only secret | Uploads Worker source maps; never sync to the Worker |
| `SENTRY_ORG` | Actions variable | Sentry organization slug for source-map upload |
| `SENTRY_PROJECT` | Actions variable | Sentry project slug for source-map upload |
| `SENTRY_ENVIRONMENT` | variable | `production`, `staging`, or `development` |
| `SENTRY_RELEASE` | CI-generated variable | Git commit SHA shared by runtime events and source maps |
| `AI_TELEMETRY_RECORD_CONTENT` | variable | Records full textual AI inputs and outputs when `true` |
| `CLOUDFLARE_OBSERVABILITY_TOKEN` | local operator secret | Historical Workers Logs queries; requires `Workers Observability Write` and is never synced to the Worker |
| `CLOUDFLARE_ACCOUNT_ID` | local/CI secret | Account queried by the log CLI; inferred from a single Wrangler account when omitted |

Production uses 100% Sentry sampling for trip-agent routes, 10% for other API
routes, and 0% for health checks. Cloudflare persists all logs and samples
platform request traces at 10%.

`AI_TELEMETRY_RECORD_CONTENT=true` sends trip conversation text, prompts,
model replies, and tool arguments/results to Sentry. Authorization headers,
cookies, credentials, database URLs, signed URL queries, data URLs, base64,
and attachment bytes are always removed. Limit Sentry project access and set a
retention policy appropriate for travel, reservation, and expense data. Set
the flag to `false` and redeploy to stop content capture immediately.

## Trace model

Every response carries `x-request-id`. Agent chat responses also carry
`x-agent-turn-id`; CORS exposes both headers. A supplied request id is retained only when
it matches the safe request-id format; otherwise the API generates a UUID.
Agent executions additionally carry `tripId`, `agentSessionId`, `turnId`,
`messageId`, `suggestionId`, and `toolCallId` when available.

`requestId` is the application UUID. Cloudflare's `$metadata.requestId` is the
invocation id (often the Ray/request grouping id) and can contain several
application log events. The log CLI labels and expands these separately.

The initiating user UI message id is the stable `turnId`. A later tool-approval
request creates a new HTTP trace but keeps the same `turnId` and AI SDK
`toolCallId`, so it can be found without keeping a span open across user input.

Typical explicit-chat trace:

```text
HTTP request
└── opentrip.agent.chat
    ├── opentrip.agent.persist_message
    ├── ai.generateText / ai.streamText
    │   ├── model inference
    │   └── tool execution
    │       ├── opentrip.provider.*
    │       └── opentrip.trip.operation.apply
    └── opentrip.agent.persist_message
```

Ambient replies, addressed checks, operation evaluations, and suggestion
responses use their own `opentrip.agent.*` parent spans. Deferred work is kept
alive by the Worker execution context and logs the originating request and
turn identifiers. Weather, geo, lodging, street-view, and attachment reads have
explicit child spans beneath their AI tool spans. If the browser disconnects
while the independent SSE drain finishes successfully, the chat span records
`opentrip.agent.client_disconnected=true` without reporting a false failure.

## Debugging workflow

1. Copy `x-request-id` from the failing browser Network response. For agent UI
   failures also copy a message, suggestion, or tool-call id from the payload.
2. Search Sentry Discover using the most specific available attribute:

   ```text
   request.id:<request-id>
   opentrip.agent.turn_id:<turn-id>
   opentrip.agent.message_id:<message-id>
   opentrip.agent.suggestion_id:<suggestion-id>
   opentrip.trip.id:<trip-id>
   gen_ai.tool.call.id:<tool-call-id>
   ```

3. Open the trace waterfall. Inspect authorization/context loading, AI steps,
   inference finish reason and token usage, tool execution, approval, domain
   apply, message persistence, and stream completion in that order.
4. If Sentry has no sampled trace, query historical Workers Logs. The command
   first finds the matching event and then expands every Cloudflare invocation
   so sibling tool/provider/persistence events appear in chronological order:

   ```bash
   pnpm logs:cf -- --request-id <request-id> --since 1h
   pnpm logs:cf -- --turn-id <turn-id> --since 24h
   pnpm logs:cf -- --message-id <message-id>
   pnpm logs:cf -- --tool-call-id <tool-call-id>
   pnpm logs:cf -- --trip-id <trip-id> --event agent.tool.failed
   ```

   Wrangler itself exposes live tailing, not historical replay. For a live
   reproduction use the same repository command, which delegates to Wrangler:

   ```bash
   pnpm logs:cf -- --live --contains <request-or-turn-id>
   ```

5. In Docker, use the same fields:

   ```bash
   docker compose -f deploy/docker/compose.yaml logs -f api \
     | jq -R 'fromjson? | select(tostring | contains("<request-or-turn-id>"))'
   ```

6. Cross-check persisted state without selecting message contents unnecessarily:

   ```sql
   SELECT id, trip_id, role, source, trip_version, created_at
   FROM agent_messages
   WHERE id = '<message-id>';

   SELECT id, trip_id, message_id, status, trip_version, created_at, updated_at
   FROM agent_suggestions
   WHERE id = '<suggestion-id>';
   ```

   Compare the persisted `trip_version` with the mutation span's before/after
   versions to distinguish stale reads, concurrent claims, and failed writes.

## Symptom guide

| Symptom | First evidence to inspect |
| --- | --- |
| Stream appeared but assistant row vanished | `agent.stream.complete`, then `agent.persist_message` |
| Tool succeeded but planner rolled back | `opentrip.trip.operation.apply`, version attributes, mutation echo |
| Approval did not execute | Search both HTTP traces by `turnId` and `gen_ai.tool.call.id` |
| Proactive suggestion is missing | Evaluation decision, confidence threshold, allowed operation, `agent.suggestion.created` |
| Browser reports CORS after a Worker failure | `worker.fetch_failed`, deferred completion, pool disposal; check for Cloudflare 1101 |
| Provider returned 429/5xx | Inference span, provider metadata, finish reason, retry events |

## Log event reference

All application logs are one-line JSON with `timestamp`, `level`, `event`, and
available correlation ids. Important events include:

- `http.request.completed`
- `agent.persist_message`
- `agent.stream.complete`
- `agent.suggestion.created`
- `agent.addressed_check_failed`
- `agent.ambient_reply_failed`
- `agent.operation_evaluation_failed`
- `agent.deferred_task_failed`
- `worker.fetch_failed`
- `worker.pool_dispose_failed`

Do not paste full Sentry events into public issues. Share the trace or event id
with an authorized project member instead.

## Historical Workers Logs setup

Create a dedicated Cloudflare API token with `Workers Observability Write`.
Despite the operation being read-only, this is the permission currently
required by the Telemetry Query API. Do not reuse the deployment token and do
not add the query token to Worker secrets.

```bash
cp deploy/cloudflare/observability.example.env .env.observability
# Fill the two values, then load them into the current shell.
set -a; source .env.observability; set +a

pnpm logs:cf -- --request-id <id> --since 1h
```

Historical options are composable and use AND semantics:

| Option | Meaning |
| --- | --- |
| `--request-id` | application `x-request-id` |
| `--invocation-id` | Cloudflare `$metadata.requestId` |
| `--turn-id` / `--message-id` / `--tool-call-id` / `--trip-id` | stable agent/business correlation fields |
| `--event` | exact structured event name |
| `--contains` | full-text needle across event fields |
| `--since 15m\|1h\|24h` | relative window; default `1h` |
| `--from` / `--to` | ISO-8601 bounds |
| `--limit` | maximum output events, default `100`, maximum `2000` |
| `--format pretty\|ndjson\|json` | human, pipeline, or complete event output |
| `--no-expand` | return only directly matching events |

If `CLOUDFLARE_ACCOUNT_ID` is absent, the command uses `wrangler whoami
--json` only when it exposes exactly one account. Authentication/API errors go
to stderr and return non-zero; zero matching events is a successful query.

## Find a message from its text

`agent.persist_message` stores a pseudonymous `messageFingerprint`, never the
message body. Normalization is Unicode NFKC followed by whitespace collapse and
trim; the digest is lowercase SHA-256 prefixed with `sha256:`. File parts,
tool payloads, attachments, and generated UI are excluded.

Prefer stdin so sensitive text does not enter shell history or the process
list:

```bash
pbpaste | pnpm logs:cf -- --message-stdin --since 2h
```

The Agent message menu's **Copy debug info** action provides tripId, messageId,
available live requestId/turnId, toolCallIds, source, createdAt, and the same
fingerprint. A hash is pseudonymous rather than anonymous and can still be
dictionary-tested; restrict Workers Logs access accordingly.

## Street-view card runbook

For a missing or invalid generated card, query the copied message id and inspect
these events in order:

1. `agent.model.step_completed`: confirm the model actually emitted a tool call.
2. `agent.tool.started` and `agent.tool.completed`/`agent.tool.failed`: verify
   the real `toolCallId`, coordinates, radius, and tool result state.
3. `street_view.provider.request_failed` and
   `street_view.provider.retry_scheduled`: distinguish 401/403 configuration,
   429, timeout, and provider 5xx; attempts never exceed two.
4. `street_view.search_completed`: only `outcome=found` ids may ground a card.
5. `street_view.search_model_output`: confirm whether search `toModelOutput`
   attached a static preview (`previewAttach=attached`) or skipped
   (`skipped_empty` / `skipped_panorama_only` / `preview_unavailable`).
6. `street_view.cache.hit`/`miss`: a card immediately following a successful
   search should use the 15-minute metadata cache; preview bytes are cached
   after their first successful read.
7. `agent.persist_message`: confirm the sanitized assistant message and its
   fingerprint were written.

If the provider call failed, the generation policy removes both street-view
tools for the remainder of that reply. Any prose claiming additional
coordinates were tried is therefore a model-grounding defect and should be
reported with the turnId and toolCallId; an ungrounded `StreetViewCard` is
discarded both during rendering and before persistence.
