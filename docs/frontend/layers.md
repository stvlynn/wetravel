# Frontend layers

Responsibilities and boundaries per FSD layer in `apps/web/src`.

## app

Application setup: providers (i18n, React Query, router), global style imports,
and the root render. No business logic. Files: `app/providers`, `app/styles`,
`app/router.tsx`, `app/App.tsx`.

## pages

Route-level compositions. A page reads routing/session data and composes
widgets and features. Two pages:

- `pages/trips` — the trips home grid and guided create-trip wizard.
- `pages/invite` — the `/invite/:token` accept surface. Previews the invite
  (public), renders the auth form inline when signed out so the token survives
  sign-in, then adds the user and routes into the planner on accept.
- `pages/travel-planner` — the single-trip workspace. Because this is one large
  prototype surface, its map/schedule/budget/sidebar blocks live as
  **page-private widgets** under `pages/travel-planner/ui`. The page composes the
  `AppSidebar` and main content with the `shared/ui/splitter` primitive and
  persists the resulting width/collapse state through the backend preferences
  API.

  The trip agent (see [../backend/agent.md](../backend/agent.md)) is also
  page-private: `ui/agent/` holds the top-right sparkle toggle (mirroring the
  left sidebar's expand control), the right agent panel with the shared chat —
  a `bg-sidebar` base layer mirroring the left `AppSidebar` that reveals via a
  width transition, so the main panel rounds both edges when it is open — and
  the bottom-right intervention cards (Approve/Deny, AI SDK approval DTO).
  Write-tool approval cards render the tool arguments through
  `ui/agent/AgentToolPreview.tsx`, which reuses the planner's own `StopCard`
  for stop mutations (and a labeled expense row / one-line summaries for the
  other tools) so the trip receives a rendered DTO preview, never raw JSON;
  assistant bubbles render Markdown via [Streamdown](https://streamdown.ai)
  (AI SDK UI's streaming Markdown path) with the shared `.wf-markdown`
  typography; reasoning parts render through `ui/agent/AgentReasoning.tsx`, a
  Collapsible modeled on AI SDK UI's `Reasoning` element (auto-opens while the
  model thinks, auto-collapses ~1 s after it finishes, and caps its content in a
  scrollable max-height container); the composer (`ui/agent/AgentComposer.tsx`)
  and stop-detail comment input (`ui/StopDetail.tsx`) share
  `ui/mention/` for an inline `@`-mention list of trip members and the agent
  that opens only when `@` is typed (never on paste/drop), filters as you type,
  and is navigated with Up/Down + Tab/Enter to insert (Escape dismisses); member
  mentions persist a `mentions` part on the message and polled clients show a
  toast to each @mentioned user (never the author) — stop comments that
  `@mention` members are mirrored into the agent session so the same toast path
  fires; stop comments and agent chat bubbles expose a hover reply control
  (`ui/quote/`) that quotes the snippet into the composer (markdown `>` block +
  optional `@` mention) and renders received quotes as an inline chip;
  `@agent` in chat routes through the
  streaming `useChat` path so reasoning/tool approval stay live;
  `model/useAgentChat.ts` wraps AI SDK UI's
  `useChat` with
  `addToolApprovalResponse` and `sendAutomaticallyWhen` for write-tool
  approvals (streaming buffer only — the shared history lives in React Query;
  chat turns reuse the client UIMessage id on persist so live vs history
  dedupe by id), and `model/useAgentEvents.ts` polls the session every 12 s
  for all members. The panel's collapsed state persists via the preferences
  API. All of it renders only when `GET /api/agent/status` reports the agent
  enabled.

Pages may hold page-specific state and data fetching (Pages First).

Trip mutation lifecycle and `QueryClient` calls remain page-owned. The reusable
`entities/trip` public API exposes only pure immutable mappers such as
`toTripSummary` and `upsertTripSummary`; it does not import TanStack Query,
routing, or transport code.

## widgets

Reusable composite blocks used by more than one page:

- `widgets/app-sidebar` — the persistent left sidebar shared by both pages.
  Pins a brand (or a page-provided `top`, e.g. the planner's back + trip title)
  above a scrollable content slot, with the account menu docked at the bottom.
  The trips page opens a guided create-trip wizard from the main header (and
  empty-state CTA). On success the wizard echoes the `POST /api/trips` body into
  the trips list + trip detail caches (see [data-caching.md](data-caching.md);
  no immediate list refetch — Hyperdrive read-after-write) and navigates to the
  planner so the one-shot `@agent` seed can run. The planner injects its
  itinerary into the middle slot.
  It is the base layer: pages set the shell background to the sidebar color and
  float the main panel above it with rounded left corners + a left shadow. A
  collapse control sits at the sidebar's top-right; collapsing hides it and shows
  a floating expand control over the panel. The state persists in localStorage.
- `widgets/user-menu` — avatar trigger docked at the sidebar bottom. Opens an
  upward popover holding account info, settings entry points, and sign out.
- `widgets/settings-dialog` — responsive account settings composition for
  profile, language, appearance, and application information.

There is no top bar; global chrome lives in the sidebar. Most planner blocks
stay page-private under `pages/travel-planner/ui` until reuse emerges — the
narrow-screen planner shell (bottom navigation, itinerary/detail/agent
sheets) is page-private under `pages/travel-planner/ui/mobile`. See
[mobile-pwa.md](mobile-pwa.md).

## features

Reusable, self-contained user scenarios (e.g. `features/auth` sign-in form).
UI + model + api for that scenario.

## entities

Reusable domain data and mapping with no transport logic. `entities/trip`,
`entities/stop`, `entities/expense`, `entities/member` hold TypeScript types and
pure helpers (formatting, grouping, balance math mirrored for display).

## shared

Framework-agnostic reused code:

- `shared/ui` — cossUI primitives + the map wrapper.
- `shared/api` — typed API client.
- `shared/auth` — Better Auth React client.
- `shared/i18n` — i18next setup and locale resources.
- `shared/lib` — utilities (class names, formatters, `useMediaQuery` /
  `useIsMobile` viewport detection).
- `shared/config` — env access, route/query keys.

## Import rule

Downward only. `entities` must not import `features`; slices on the same layer
must not import each other. Enforced by review and the alias structure.
