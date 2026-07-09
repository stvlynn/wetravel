# 0005 — Trip agent

## Status

Accepted.

## Context

OpenTrip is a collaborative trip workspace. The agent should help members notice
real planning problems without becoming another busy panel in the product. Most
of the time it stays collapsed as a quiet chrome control that mirrors the
planner's existing top-left and top-right expand/collapse affordances.

The agent is scoped to a trip project. All authorized trip members can read and
contribute to the same agent conversation history; users outside the existing
trip permission model cannot access it. Whitelisted high-risk write operations
also wake the agent so it can decide whether a change deserves attention.

Current Vercel AI SDK documentation supports this shape:

- AI SDK UI `useChat` can use a custom `DefaultChatTransport` with project-owned
  API paths, request bodies, headers, and same-origin credentials.
- Server handlers can stream UI messages with `streamText`,
  `createUIMessageStreamResponse`, and `toUIMessageStream`.
- UI messages can be validated, converted to model messages, and persisted at
  the end of a stream.
- Tool calls and structured outputs are supported, allowing the model to return
  an explicit intervention decision and a pending patch proposal.

## Decision

### SDK and Integration Boundary

- Use **Vercel AI SDK** in `apps/api` for model calls, streaming responses, tool
  orchestration, and structured intervention decisions.
- Use **AI SDK UI** in `apps/web` for the chat state model and streaming chat
  transport. The frontend will point `DefaultChatTransport` at OpenTrip-owned
  `/api/trips/:tripId/agent/*` endpoints and include credentials so existing
  Better Auth sessions apply.
- Keep the agent inside the existing React + Vite SPA and Hono API. We do not
  introduce a separate agent service for the first implementation.
- Treat AI SDK examples as API-shape guidance, not as architecture guidance:
  Hono routes remain thin, application use cases orchestrate work, and domain
  state changes still go through the Trip aggregate.

### Trip Session Model

- A trip has exactly one logical agent session.
- The session is keyed by `tripId`, not by browser tab or user.
- All authorized trip members can see the same agent messages, operation events,
  pending suggestions, and applied/dismissed history.
- The session stores:
  - user-authored messages,
  - assistant messages,
  - whitelisted operation events,
  - structured intervention decisions,
  - pending patch proposals and their status.
- Agent message metadata records the actor, timestamp, source
  (`chat`, `mention`, `operation`, `threshold`), and related trip version.

### Permissions

- Reuse the existing trip permission model.
- Non-members cannot read, write, or infer that a trip agent session exists.
- Viewers may read and talk to the agent when they can view the trip, but they
  cannot apply patches that require edit permission.
- Editors and owners may apply agent patches when the underlying trip operation
  is already allowed for their role.
- Every apply attempt rechecks permissions server-side. Frontend affordances are
  convenience only.

### Triggers

The agent can be invoked by three trigger families:

- **Explicit chat**: a member opens the agent panel and sends a message.
- **Mention**: a member uses `@agent` in supported collaborative surfaces.
- **Operation event**: a whitelisted write operation commits and emits a compact
  query describing who changed what, when, and against which trip state.

The initial operation whitelist should cover high-risk itinerary writes only:

- add or edit a stop,
- reorder stops or days,
- edit day date or city,
- add or edit lodging/transport-like stops,
- add or edit weather-sensitive outdoor activities,
- add or edit expenses when the amount, payer, or participants look unusual for
  the trip.

The whitelist is intentionally narrow. New triggers must be added deliberately
when the product knows what risk they represent.

### Proactive Intervention Policy

- The proactive decision is **AI-judged**, not purely rule-based.
- Each operation event is sent as a structured query containing the actor,
  timestamp, operation type, normalized DTO diff, relevant trip snapshot, and
  recent agent context.
- The model must return a structured decision with at least:
  `shouldNotify`, `severity`, `confidence`, `reason`, `suggestion`,
  `pendingPatch`, and `expiresAt`.
- The system prompt requires silence unless the model finds a material planning
  risk above the configured threshold.
- Examples of material risks:
  - impossible or highly unrealistic timing,
  - duplicate or conflicting stops,
  - repeated lodging or transport bookings,
  - outdoor plans that conflict with known weather,
  - route order that creates avoidable backtracking,
  - budget edits that are inconsistent with participants or payer.
- Low-confidence observations are persisted as quiet context but do not create
  a toast.

### Frontend Behavior

- The collapsed agent is a small expand/collapse control aligned with the
  existing planner chrome rather than a persistent chat bubble.
- The expanded surface is a right-side agent conversation panel.
- The agent does not proactively open the panel.
- A proactive intervention appears as a toast visible to all online authorized
  trip members.
- The toast includes a concise reason and enough pending patch detail for the
  user to understand what will change before applying.
- Toast actions are localized through i18n keys. Initial English labels:
  - `Approve`
  - `Discuss`
  - `Deny`
- Initial Simplified Chinese labels:
  - `批准`
  - `讨论`
  - `拒绝`
- `Approve` applies exactly the displayed pending patch (approval DTO:
  `{ id, approved: true }`).
- `Discuss` opens the right-side agent panel and continues in the shared trip
  session with the intervention as context.
- `Deny` hides the toast for that user only (`{ id, approved: false }`); it does
  not delete the shared event or hide it from other members.
- Chat write-tool approvals use the same Approve/Deny affordance and the AI SDK
  `addToolApprovalResponse` API so the wire format stays consistent.

### Applying Suggestions

- The agent may propose a pending patch (proactive path) or a write tool call
  (chat path), but it does not mutate trip data until a human approves.
- Approving a proactive suggestion calls an application use case that:
  - reloads the current trip,
  - checks the caller's permissions,
  - verifies the patch still applies to the referenced trip version,
  - runs the normal domain operation,
  - records the approve action in the agent session history.
- Approving a chat write tool uses AI SDK tool approval; after approval the
  tool's `execute` runs the same domain operations.
- If the trip has changed and the patch is stale, the apply attempt is rejected
  and the agent may be asked to regenerate the suggestion.
- If multiple online users see the same toast, the first successful approve wins.
  Other clients receive the updated suggestion status.
- Agent-authored writes are attributed to the member who approved, with
  agent suggestion / tool metadata attached for audit.

### Model and Environment Configuration

- Model configuration is environment-driven for the first implementation.
- The API reads provider, model id, optional base URL, and API credentials from
  environment variables loaded from the project env file in local and Docker
  runs.
- Cloudflare deployments expose equivalent values as Worker vars/secrets.
- Model selection is not stored in the database and is not user-configurable in
  the product UI.
- Suggested variable names:
  - `AI_PROVIDER`
  - `AI_MODEL`
  - `AI_BASE_URL`
  - `AI_API_KEY`
  - `AI_PROACTIVE_THRESHOLD`
  - `AI_MAX_TOOL_STEPS`

### Prompt and Tool Boundaries

- The system prompt defines the agent as a quiet trip-planning reviewer.
- The prompt requires the agent to prefer no response unless a change creates a
  meaningful risk for the itinerary, weather fit, duplication, route sanity, or
  budget integrity.
- Read tools may run immediately (for example weather). They must not mutate
  trip state.
- Write tools are **generated** from the application-layer trip ops registry
  (`application/trip/ops`) and projected into the Vercel AI SDK via
  `Object.fromEntries` + `tool()`. They always require human approval via AI
  SDK `toolApproval: 'user-approval'`. The model may *propose* a change by
  calling a tool; `execute` runs only after a permitted member responds with
  AI SDK `addToolApprovalResponse({ id, approved, reason? })`. New trip CRUD
  is added as a registry entry (not a hand-written tool block in the adapter).
- Write tool `execute` implementations call OpenTrip application/domain use
  cases only — never raw SQL or ad-hoc state mutation. Attribution remains with
  the approving member.
- Viewers cannot approve write tools (server auto-denies via `toolApproval`).
- Proactive intervention (operation evaluation) still returns a structured
  pending patch and stores it as a shared suggestion for multi-member toasts.
  Approving that suggestion uses the **same DTO shape** as AI SDK approval:
  `{ id, approved, reason? }` (`POST …/suggestions/:id/approve`).
- The prompt must not include secrets, raw credentials, or unrelated user data.
- Chat uses `experimental_toolApprovalSecret` so clients cannot forge approval
  responses for write tools.

## Consequences

- The agent fits the existing collaboration model: one trip, one shared context,
  one permission system.
- AI SDK UI gives the frontend a streaming chat model without forcing a Next.js
  architecture.
- Persisting operation events alongside chat history gives the model context
  while keeping the human-facing conversation understandable.
- AI-driven thresholds reduce noisy hardcoded rules, but they require structured
  outputs, careful prompts, and server-side validation before any patch applies.
- Showing proactive toasts to all online members improves shared awareness, but
  concurrent apply/dismiss behavior must be explicit.
- Environment-only model configuration keeps the first implementation simple,
  but changing models remains an operator action rather than a product setting.
