# json-render agent UI integration

**Status:** Approved  
**Date:** 2026-07-13  
**Scope:** Add catalog-constrained generative UI to the existing shared trip
agent without bypassing its tool approval or domain mutation boundaries.

## Objective

Allow an assistant reply in the planner agent panel to combine streaming text,
reasoning, tool calls, and a progressively rendered native UI. Generated UI is
used for compact itinerary drafts, option comparisons, alerts, stop summaries,
and budget summaries. It complements the planner and never becomes a second
write path.

## Dependency baseline

- Upgrade the web application from React 18.3 to the current React 19.2 release
  required by `@json-render/react`.
- Keep the API application's existing Zod 3 dependency. A dedicated workspace
  catalog package owns Zod 4 and `@json-render/core`, allowing both Zod majors
  to coexist at an explicit package boundary.
- Use `@json-render/core` and `@json-render/react` 0.19. Do not install the
  shadcn registry because OpenTrip renders with cossUI primitives and tokens.

## Architecture

### Shared catalog

Create a framework-neutral workspace package containing the catalog schemas,
component descriptions, safe action schemas, and prompt generator. Both the
Hono AI adapter and the React renderer import its public API. The catalog is
the single source of truth; the backend does not depend on web code and the web
application does not duplicate schemas.

The initial component surface is deliberately small: stack, card, text, badge,
alert, day plan, stop summary, option comparison, budget summary, and action
button. Props use bounded enums and bounded arrays/strings where practical so a
model cannot create an unbounded or arbitrary component tree.

Safe actions are limited to sending a constrained agent follow-up and focusing
an existing day or stop in the current planner. There is no arbitrary URL,
endpoint, callback name, script, HTML, or direct trip mutation action.

### Backend stream

The existing `streamText` result is converted with AI SDK 7's stateless
`toUIMessageStream`, preserving original messages, generated message ids,
reasoning, and the persistence callback. json-render's `pipeJsonRender` wraps
that UI message stream and converts inline SpecStream JSONL into data parts.
The response remains an AI SDK UI message stream consumed by the existing
`DefaultChatTransport`.

The agent system prompt appends `catalog.prompt({ mode: "inline" })` only for
explicit streaming chat. Ambient and proactive evaluation paths remain plain,
read-only responses and do not pay the catalog token cost.

Assistant persistence recognizes json-render data parts as content. Persisted
parts remain opaque JSON in `agent_messages`, so polling and refresh preserve
the generated interface. Persisted specs are not flattened into assistant text.
For an explicit refinement such as “change the second option”, the latest
validated, bounded spec is supplied through json-render's
`buildUserPrompt({ currentSpec, editModes: ["patch"] })` format. The response
message is seeded with that base `data-spec` before streamed patches so live and
rehydrated compilation start from the same spec; an unchanged seed is removed
before persistence. Fresh requests do not receive old spec JSON. Street-view
specs are not reused because image ids require same-message tool grounding.

### Frontend renderer

Planner-specific renderer code stays under `pages/travel-planner` following
FSD Pages First. A typed registry maps catalog components onto existing cossUI
Button, Card, Badge, and semantic token styling. `useJsonRenderMessage` compiles
both live and persisted message parts, enabling the same render path during
streaming and after refresh.

Generated actions are implemented by an allowlisted provider. A write-looking
action sends a deterministic follow-up into the same `useChat` flow. The model
must then call the existing generated trip tool, and the user must approve that
tool before `applyTripOp` can mutate the aggregate. Focus actions only change
local planner selection and validate referenced ids against the loaded trip.

All generated labels and model-provided content are dynamic data. Static
surrounding copy, errors, accessibility labels, and fallback messages remain in
the agent locale resources.

## Data and security boundaries

1. Catalog and Zod schemas constrain component and action names and props.
2. The React registry contains no raw HTML renderer or dynamic component
   lookup outside the catalog.
3. Action handlers ignore unknown actions and validate entity ids against the
   current trip.
4. Generated UI cannot call HTTP endpoints directly.
5. Trip writes continue through AI SDK tool approval, the trip operation
   registry, application service, and domain aggregate.
6. Spec context returned to the model is size-bounded to avoid uncontrolled
   prompt growth.

## Error handling

- Invalid or incomplete streaming patches show the accompanying text and a
  localized, non-blocking fallback instead of crashing the agent timeline.
- Renderer errors are isolated to the generated UI surface.
- A reply containing only valid json-render data parts is persisted.
- Unknown or stale day/stop focus actions are ignored and surfaced with a
  localized message.
- Tool approval behavior remains authoritative if a generated action asks to
  apply a plan.

## Verification

- Catalog schema and safe-action tests.
- Text plus UI, UI-only, malformed patch, persistence, and rehydration tests.
- Read-tool then UI and write-tool approval pause/resume stream tests.
- React registry/action tests for allowlisting and stale ids.
- MiniMax reasoning and non-json-render messages remain renderable.
- Full typecheck, lint, tests, production builds, documentation checks, and
  Cloudflare Worker build validation.
