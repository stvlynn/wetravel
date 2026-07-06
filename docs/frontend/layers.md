# Frontend layers

Responsibilities and boundaries per FSD layer in `apps/web/src`.

## app

Application setup: providers (i18n, React Query, router), global style imports,
and the root render. No business logic. Files: `app/providers`, `app/styles`,
`app/router.tsx`, `app/App.tsx`.

## pages

Route-level compositions. A page reads routing/session data and composes
widgets and features. Two pages:

- `pages/trips` — the trips home grid.
- `pages/travel-planner` — the single-trip workspace. Because this is one large
  prototype surface, its map/schedule/budget/sidebar blocks live as
  **page-private widgets** under `pages/travel-planner/ui`. The page composes the
  `AppSidebar` and main content with the `shared/ui/splitter` primitive and
  persists the resulting width/collapse state through the backend preferences
  API.

Pages may hold page-specific state and data fetching (Pages First).

## widgets

Reusable composite blocks used by more than one page:

- `widgets/app-sidebar` — the persistent left sidebar shared by both pages.
  Pins a brand (or a page-provided `top`, e.g. the planner's back + trip title)
  above a scrollable content slot, with the account menu docked at the bottom.
  The trips page fills it with nav (new trip); the planner injects its itinerary.
  It is the base layer: pages set the shell background to the sidebar color and
  float the main panel above it with rounded left corners + a left shadow. A
  collapse control sits at the sidebar's top-right; collapsing hides it and shows
  a floating expand control over the panel. The state persists in localStorage.
- `widgets/user-menu` — avatar trigger docked at the sidebar bottom. Opens an
  upward popover holding account info, settings entry points, and sign out.
- `widgets/settings-dialog` — responsive account settings composition for
  profile, language, appearance, and application information.

There is no top bar; global chrome lives in the sidebar. Most planner blocks
stay page-private under `pages/travel-planner/ui` until reuse emerges.

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
- `shared/lib` — utilities (class names, formatters).
- `shared/config` — env access, route/query keys.

## Import rule

Downward only. `entities` must not import `features`; slices on the same layer
must not import each other. Enforced by review and the alias structure.
