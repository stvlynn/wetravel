# Domain model

Reference: [../reference/handoff.md](../reference/handoff.md) for the source
data and behaviors.

## Aggregate: Trip

`Trip` is the aggregate root. It owns members, days, stops, and expenses, and
enforces all invariants. External code references a trip by id and mutates it
only through aggregate methods.

### Contained entities / value objects

- **TripMember** — `{ id, name, shortName, initials, avatarBg, avatarFg,
  image, isCurrentUser }`. `image` is an optional avatar URL; the UI falls back
  to a colored circle when it is absent.
- **TripDay** — `{ number, dateLabel, city, color }`.
- **Stop** (entity) — `{ id, day, time, duration, name, area, category,
  lat, lng, cost, costCurrency, createdBy, transit, note, votes: MemberId[],
  comments: Comment[], order }`. `note` is optional Markdown. `costCurrency` is
  the ISO code for `cost` (empty string means "use the trip currency"); costs
  are display-only and never enter the budget.
- **Comment** (value object) — `{ author, timeLabel, text }`.
- **Expense** (entity) — `{ id, description, payer, amount, currency,
  participants, whenLabel }`. `currency` is the ISO code for `amount`.
- **Money** (value object) — integer minor units + currency (JPY); formats as
  `¥` + grouped integer.
- **SettlementPlan** (value object) — the computed transfers.

## Business rules

- **toggleVote(stopId, memberId)** — add the member to the stop's votes if
  absent, else remove. Idempotent per member.
- **addComment(stopId, memberId, text)** — trimmed non-empty text is appended
  as a `Comment`; empty text is rejected.
- **insertStop(day, index, draft)** — inserts a stop at a position within a
  day. Coordinates interpolate from neighbors, or fall back to the day center
  (or use `draft.lat/lng` when provided). Optional `category`, `cost`, and
  `note` default to `Plan`, `0`, and empty. `costCurrency` is recorded only when
  there is a cost, defaulting to the trip currency when omitted.
  Ordering is preserved across the whole trip.
- **addExpense(draft)** — records an equally split expense. `currency` defaults
  to the trip currency when omitted. Current settlements do not perform FX
  conversion; mixed-currency expenses are preserved for display/future FX support
  while aggregate math still sums numeric amounts.
- **create(draft, owner)** — new trip in `planning` status with the owner as its
  first member, one empty day, and `startDate` set to today (ISO). Day labels are
  derived from `startDate` on the read side, so days carry no fake "Day N" text.
- **addDay()** — appends an empty day with the next number and a cycled color;
  its calendar date is derived from `startDate`.
- **addExpense(draft)** — requires a positive amount, a payer, and >= 1
  participant; split is equal across participants.
- **balances()** — for each member, `paid - fairShare` where `fairShare` sums
  `amount / participants.length` over expenses they participate in.
- **settlement()** — greedy match: sort debtors and creditors by magnitude and
  transfer `min(debt, credit)` until cleared, producing the minimal transfer
  set. Matches the prototype algorithm.

## User preferences

`UserPreference` is a lightweight per-user read/write model for UI chrome, not a
business aggregate. It lives in `domain/preferences`:

- `PlannerSidebarPreference` — value object `{ width: number, collapsed: boolean }`.
- `UserPreferenceSnapshot` — `{ userId, plannerSidebar, updatedAt }`.

The repository port (`UserPreferenceRepository`) is implemented by
`PgUserPreferenceRepository`. Preferences are exposed through the application
layer as DTOs; there are no domain invariants beyond clamping the width to the
allowed range at the edge.

## Repository ports

Defined in `domain/trip/ports`:

- `TripRepository` — `findSummaries()`, `findById(id)`, `create(trip)`,
  `rename(id, title)`, `addDay(tripId, day)`, `save(trip)`.

`domain/preferences/ports`:

- `UserPreferenceRepository` — `findByUserId(userId)`,
  `updatePlannerSidebar(userId, width, collapsed)`.

One repository per aggregate/model. Adapters live in `infrastructure/persistence`.

## Determinism

Money math uses integers (JPY has no minor unit here); no floating-point money
is persisted. Settlement rounding matches the prototype (`Math.round`).
