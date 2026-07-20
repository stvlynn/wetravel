# Domain model

Reference: [../reference/handoff.md](../reference/handoff.md) for the source
data and behaviors.

## Aggregate: Trip

`Trip` is the aggregate root. It owns members, days, stops, and expenses, and
enforces all invariants. External code references a trip by id and mutates it
only through aggregate methods.

### Contained entities / value objects

- **TripMember** — `{ id, name, shortName, initials, avatarBg, avatarFg,
  image, userId, role, canInvite, isCurrentUser }`. `image` is an optional
  avatar URL; the UI falls back to a colored circle when it is absent. `id` is
  the trip-local membership id used by stops, votes, comments, and expenses;
  `userId` is the Better Auth user backing the membership (null for legacy/demo members).
  `role` is `owner | editor | viewer`; `canInvite` gates creating further
  invites. `isCurrentUser` is computed per request (member `userId` equals the
  requester) rather than stored, except on legacy demo members where the seeded
  flag is used.
  User-backed display fields are a denormalized projection of the Better Auth
  user. A profile update synchronizes `name`, `shortName`, `initials`, and
  `image` across all memberships for that `userId`, bumps each affected trip
  revision, and emits a `members` realtime invalidation.
- **TripDay** — `{ number, date, dateLabel, city, color }`, where `date` is
  ISO `YYYY-MM-DD` and `dateLabel` is a legacy fallback for imported labels.
- **Stop** (entity) — `{ id, day, time, duration, name, area, category,
  lat, lng, cost, costCurrency, createdBy, transit, note, votes: MemberId[],
  comments: Comment[], order }`. `note` is optional Markdown that may embed
  hosted image URLs from `POST /api/trips/:id/media`. `costCurrency` is
  the ISO code for `cost` (empty string means "use the trip currency"); costs
  are display-only and never enter the budget.
- **Comment** (value object) — `{ author, timeLabel, text }`.
- **Expense** (entity) — `{ id, description, payer, amount, currency, category,
  participants, whenLabel }`. `currency` is the ISO code for `amount`; `category`
  reuses the shared stop categories (defaults to `Plan`).
- **Money** (value object) — integer minor units + currency (JPY); formats as
  `¥` + grouped integer.
- **SettlementPlan** (value object) — the computed transfers.

## Business rules

- **toggleVote(stopId, memberId)** — add the member to the stop's votes if
  absent, else remove. Idempotent per member.
- **addComment(stopId, memberId, text)** — trimmed non-empty text is prepended
  (newest first) as a `Comment`; empty text is rejected. Agent replies use the
  same path with author `agent`.
- **insertStop(day, index, draft)** — inserts a stop at a position within a
  day. Coordinates interpolate from neighbors, or fall back to the day center
  (or use `draft.lat/lng` when provided). Optional `duration`, `category`,
  `cost`, and `note` default to `1h`, `Plan`, `0`, and empty. `costCurrency` is
  recorded only when there is a cost, defaulting to the trip currency when omitted.
  Ordering is preserved across the whole trip.
- **addExpense(draft)** — records an equally split expense. `currency` defaults
  to the trip currency when omitted; `category` defaults to `Plan`. Current settlements do not perform FX
  conversion; mixed-currency expenses are preserved for display/future FX support
  while aggregate math still sums numeric amounts.
- **create(draft, owner)** — new trip in `planning` status with the owner as its
  first member (role `owner`, `canInvite` true, generated trip-local member id,
  `userId` set), one empty day, and `startDate` set to today (ISO). Day labels
  are derived from `startDate` on the read side, so days carry no fake "Day N" text.
- **cloneFromTemplate(template, owner)** — deep-copies a template trip for a new
  owner. Regenerates trip / stop / expense ids, remaps member ids, replaces the
  template owner slot with the real user, and leaves other members as cosmetic
  collaborators (`userId: null`). Used when provisioning a sample trip on
  sign-up.
- **addMember({ userId, name, image, role, canInvite })** — adds a real user as a
  member with a generated trip-local id and cycled avatar palette. Rejects adding
  a user who is already a member (the `(trip_id, user_id)` unique constraint backs
  this at the database).
- **permissionsFor(userId)** — resolves `{ isMember, canEdit, canInvite }`.
  Viewers get `canEdit: false`. Non-members of a real trip get all-false. Legacy
  demo trips (no user-backed members) stay open so the seeded planner keeps
  working for any signed-in user.
- **actingMemberId(userId)** — the trip-local member id that authors a user's
  actions (votes, comments, inserts), falling back to the legacy current-user
  member on demo trips.
- **addDay()** — appends an empty day with the next number and a cycled color;
  its calendar date is derived from `startDate`.
- **updateDay(number, draft)** — updates an existing day's structured metadata
  (`date` and/or `city`, with `dateLabel` retained as legacy fallback) without
  renumbering the day or moving stops.
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
- `UserPreferenceSnapshot` — `{ userId, plannerSidebar, agentPanelCollapsed, updatedAt }`.

The repository port (`UserPreferenceRepository`) is implemented by
`SqlUserPreferenceRepository`. Preferences are exposed through the application
layer as DTOs; there are no domain invariants beyond clamping the width to the
allowed range at the edge.

Update methods (`updatePlannerSidebar`, `updateAgentPanel`) return the **written**
snapshot (command result), not a post-write `findByUserId`. Re-SELECT after UPSERT
is unsafe under Hyperdrive query caching — see
[../operations/cloudflare.md](../operations/cloudflare.md#hyperdrive-read-after-write).

## Repository ports

Defined in `domain/trip/ports`:

- `TripRepository` — `findSummaries(userId)`, `findById(id)`, `create(trip)`,
  `addMember(tripId, member)`, `rename(id, title)`, `addDay(tripId, day)`,
  `updateDay(tripId, day)`, `reorderDays(trip)`, `deleteDay(trip)`, `save(trip)`.
  `findSummaries` returns trips the user belongs to plus legacy/demo trips with
  no user-backed members.

`application/user/profile-projection-service` defines the
`MemberProfileProjection` driven port used by Better Auth hooks. The SQL trip
repository implements it without expanding the aggregate repository contract.

`domain/invite/ports`:

- `TripInviteRepository` — `create(invite)`, `findByTokenHash(hash)`,
  `recordAcceptance(inviteId, userId)`.

`domain/preferences/ports`:

- `UserPreferenceRepository` — `findByUserId(userId)`,
  `updatePlannerSidebar(userId, width, collapsed)`,
  `updateAgentPanel(userId, collapsed)`.

One repository per aggregate/model. Adapters live in `infrastructure/persistence`.

The composition root binds Trip, invite, preference, auth, and agent repositories
to the cache-disabled SQL client. This is an infrastructure consistency policy;
domain ports contain no Hyperdrive or cache concepts. Cached SQL clients may be
used only by separately named, stale-tolerant read-model adapters.

## Invites

`domain/invite` holds the invite model, separate from the Trip aggregate:

- **TripInviteSnapshot** — `{ id, tripId, tokenHash, createdBy, accessScope,
  allowedEmails, role, canInvite, status, expiresAt, createdAt }`. Only the
  SHA-256 hash of the opaque token is persisted; the plaintext is returned once.
  `accessScope` is `anyone | restricted_emails`; `role` is `editor | viewer`.
- **checkInviteUsable(invite, { email, now })** — pure guard rejecting revoked,
  expired, or email-restricted redemptions.

`TripInviteService` (application) coordinates the invite and trip aggregates:
`createInvite` (requires `canInvite`), `regenerateInvite` (issues a replacement
link with the same settings, then revokes the previous token so its link stops
working — the new link is created first so a failure leaves the old one intact),
`previewInvite` (public, safe display data), and `acceptInvite` (validates
usability, adds the member, records the acceptance; idempotent for existing
members). The `TripInviteRepository` port exposes `revoke(inviteId)` to mark a
link revoked.

## Weather

`domain/weather` is a driven port, not a trip aggregate:

- **WeatherForecastQuery / WeatherForecastSnapshot** — vendor-neutral forecast
  request and response (OpenTrip naming; no OpenWeather types).
- **WeatherClient** — `fetchForecast(query)`; implemented by infrastructure
  (cache decorator + provider adapter). Application `WeatherService` is the only
  entry used by HTTP and the agent `checkWeather` tool.

See [weather.md](./weather.md).

## Geo

`domain/geo` is a driven port, not a trip aggregate:

- **GeoPlace / GeoRoute / GeoReview\*** — vendor-neutral place, route, and review
  shapes (OpenTrip naming; no Nominatim/Google types).
- **GeoProvider** — `placeSearch`, `placeNearby`, `placeDetail`, `routeCompute`,
  `routeMatrix`, `reviewLookup`; implemented by infrastructure (OSM or Google).
  Application `GeoService` is the only entry used by agent geo read tools.

See [geo.md](./geo.md).

## Lodging

`domain/lodging` is a driven port, not a trip aggregate:

- **LodgingSearchQuery / LodgingListing\*** — vendor-neutral search and listing
  shapes (Airbnb is the first adapter).
- **LodgingProvider** — `search`, `listingDetails`; implemented by
  `AirbnbLodgingProvider`. Application `LodgingService` is the only entry used
  by agent lodging read tools.

See [lodging.md](./lodging.md).

## Determinism

Money math uses integers (JPY has no minor unit here); no floating-point money
is persisted. Settlement rounding matches the prototype (`Math.round`).
