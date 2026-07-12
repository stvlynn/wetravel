# Cloudflare realtime, reservations, and offline design

**Status:** Draft for user review  
**Date:** 2026-07-12  
**Scope:** Cloudflare-native realtime collaboration, reservation management,
installable mobile PWA, and offline operation

## 1. Objective

Bring OpenTrip to feature parity with TREK in three connected areas without
introducing a second realtime architecture:

1. Trip changes appear to other connected members in realtime.
2. Members can manage structured travel reservations alongside the itinerary.
3. The web client is installable and remains useful offline, including queued
   trip mutations that synchronize after connectivity returns.

Cloudflare is the authoritative production platform. Realtime behavior uses
Cloudflare Workers and Durable Objects. Local development of the complete
feature uses Wrangler. The Docker deployment remains useful for the existing
HTTP application, but it does not receive a separate WebSocket implementation.

## 2. Architectural constraints

### Backend

- Dependencies continue to point inward: `interfaces -> application -> domain`.
- Domain code has no Hono, Cloudflare, SQL, Prisma, or WebSocket imports.
- HTTP handlers authenticate, validate, invoke application use cases, and map
  responses. They do not call SQL or Durable Objects directly.
- PostgreSQL remains the source of truth for trips and reservations.
- Durable Objects coordinate ephemeral connections and ordered delivery; they
  do not become an alternative business database.
- Every mutation accepts an idempotency key. Offline replay must be safe after
  retries, reconnects, Worker restarts, and ambiguous network failures.

### Frontend

- FSD import direction remains `app -> pages -> widgets -> features -> entities
  -> shared`.
- Realtime transport, connectivity detection, IndexedDB access, and service
  worker registration are infrastructure under `shared` or app providers.
- Reservation page logic remains in `pages/travel-planner` until another page
  actually reuses it. The reusable reservation model lives in
  `entities/reservation` because schedule, map, budget, Agent, and reservation
  views consume the same concept.
- Slices expose public APIs through `index.ts`; external code does not import
  slice internals.

### UI

- Existing coss primitives and design tokens are used before custom controls.
- Overlay composition follows Base UI/coss trigger and popup structure.
- All controls have accessible names, visible focus, and a minimum 40 x 40 px
  touch target.
- Connectivity feedback is quiet when healthy. Persistent UI appears only for
  offline, reconnecting, queued, or conflicted states.
- Frequently occurring sync events do not animate. Occasional banners and
  dialogs may use interruptible transform/opacity transitions under 300 ms and
  respect `prefers-reduced-motion`.
- Dynamic counts and monetary values use tabular numerals.

## 3. Cloudflare realtime architecture

### 3.1 Request flow

Each trip maps to one Durable Object using a stable name derived from `tripId`.
The public endpoint is:

```text
GET /api/trips/:tripId/realtime
Upgrade: websocket
```

The Worker entrypoint performs all boundary checks before forwarding:

1. Validate `Upgrade: websocket` and the request `Origin` against configured
   trusted origins.
2. Resolve the Better Auth session from the request cookie.
3. Load the trip through the consistency-critical repository and verify active
   membership.
4. Create a short-lived signed connection grant containing trip id, user id,
   display metadata, role, expiry, and a unique connection id.
5. Forward the upgrade internally to `TRIP_REALTIME.getByName(tripId)`.

The Durable Object verifies the signed grant but does not query PostgreSQL.
This keeps authorization in the existing application boundary and prevents a
hibernated object from holding a database pool.

### 3.2 Hibernation

The Durable Object uses the WebSocket Hibernation API:

- `ctx.acceptWebSocket(server, tags)` accepts connections.
- `serializeAttachment()` stores the minimal connection identity required
  after eviction.
- `ctx.getWebSockets()` and tag filters discover live connections after wake.
- `webSocketMessage`, `webSocketClose`, and `webSocketError` are the only
  connection callbacks.
- `setWebSocketAutoResponse()` handles ping/pong without waking the object.

No correctness depends on constructor-populated maps, arrays, timers, or other
in-memory state. Presence is reconstructed from accepted sockets and their
attachments after hibernation.

### 3.3 Event publication

Business mutations do not send arbitrary UI payloads. After a successful
repository save, the application publishes a `TripChange` through a driven
port:

```ts
interface TripChange {
  eventId: string;
  tripId: string;
  revision: number;
  actorId: string;
  occurredAt: string;
  scopes: Array<
    | "trip"
    | "days"
    | "stops"
    | "expenses"
    | "members"
    | "reservations"
    | "comments"
  >;
}
```

The Cloudflare publisher calls an internal Durable Object endpoint after the
database commit. The object assigns a monotonically increasing delivery
sequence, stores a bounded recent-event window in Durable Object SQLite, and
broadcasts the event to sockets other than the actor connection.

The event is an invalidation hint, not a second copy of the aggregate. Clients
refetch the affected read model from the cache-disabled API path. This avoids
merging partial aggregates and preserves PostgreSQL as the source of truth.

Publication is at-least-once. Clients deduplicate by `eventId`; missing sequence
numbers trigger a full trip refetch. A publication failure after a committed
mutation is recorded and retried with `waitUntil`. The HTTP mutation still
returns success because the database commit is authoritative; clients also
refetch on focus and reconnect, so a missed notification cannot permanently
hide state.

### 3.4 Presence

On connection and disconnection, the object broadcasts a presence snapshot
derived from current WebSockets. Presence contains only user id, display name,
avatar URL, and connection count. Multiple tabs for one user collapse into one
member with a count. Presence is ephemeral and is never written to PostgreSQL.

### 3.5 Configuration

`wrangler.api.jsonc` gains:

- a `TRIP_REALTIME` Durable Object binding;
- a versioned `new_sqlite_classes` migration;
- a compatibility date that supports the selected Hibernation behavior;
- a secret used to sign internal connection grants.

The deployment overlay script preserves these fields when injecting
environment-specific Hyperdrive, R2, variables, and secrets. No account id,
namespace id, production endpoint, or secret is committed.

## 4. Reservation management

### 4.1 Domain model

`Reservation` is its own aggregate because it has an independent lifecycle and
can be changed without loading the full trip aggregate. It references the trip,
optional day, optional stop, and optional expense by id.

Supported types:

- flight
- accommodation
- restaurant
- rail
- ground transport
- activity
- other

Supported statuses:

- tentative
- confirmed
- cancelled
- completed

The aggregate owns these invariants:

- title and provider text are trimmed and length-bounded;
- start time is required and end time cannot precede it;
- day and stop references must belong to the same trip;
- confirmation number is optional and not globally unique;
- amount is optional, non-negative, stored in minor units, and requires an ISO
  currency when present;
- cancelled reservations remain visible and retain their audit metadata;
- only trip members with edit permission may create, update, or cancel;
- deletion is explicit and permanent only when requested through the delete
  operation; cancellation is a normal status transition.

The model includes:

```text
id, tripId, type, status, title, provider, confirmationNumber,
startAt, endAt, timezone, locationName, address, latitude, longitude,
dayId, stopId, expenseId, amountMinor, currency, notes,
createdBy, createdAt, updatedAt, revision
```

### 4.2 Use cases and ports

Application use cases are `listReservations`, `createReservation`,
`updateReservation`, `cancelReservation`, and `deleteReservation`. A single
`ReservationRepository` port represents the aggregate. The application service
verifies trip access through the trip repository, invokes domain behavior,
saves through the reservation repository, and publishes a realtime change.

SQL adapters implement the port for PostgreSQL and MySQL through the existing
`SqlClient` abstraction. Prisma remains the PostgreSQL schema snapshot and is
regenerated by command; migrations and the snapshot are never handwritten.

### 4.3 HTTP contract

```text
GET    /api/trips/:tripId/reservations
POST   /api/trips/:tripId/reservations
PATCH  /api/trips/:tripId/reservations/:reservationId
POST   /api/trips/:tripId/reservations/:reservationId/cancel
DELETE /api/trips/:tripId/reservations/:reservationId
```

All commands accept `Idempotency-Key`. Updates accept `If-Match` with the
reservation revision. A stale revision returns `409 reservation_conflict` with
the current server DTO so the UI can show an explicit resolution choice.

### 4.4 Planner integration

Reservations become a fourth planner mode beside Map, Schedule, and Budget.
The reservation board groups entries by day and shows unscheduled entries
separately. Schedule cards show compact linked-reservation indicators. Selecting
an entry opens a detail pane on desktop and a coss Dialog on narrow screens.

The create/edit form uses coss Input, Select, Textarea, and Dialog components.
It defaults timezone and currency from the trip, permits linking a day or stop,
and never requires booking details that do not apply to the chosen type.

The initial scope excludes email ingestion, PDF parsing, AirTrail sync, and a
general document manager. Existing trip media can be sent to the Agent, but
reservation-specific attachments are a separate follow-up capability.

## 5. PWA and offline behavior

### 5.1 Installable application

The web build includes a standards-compliant manifest, maskable and regular app
icons, theme/background colors, standalone display, and a Service Worker. The
Pages deployment serves the manifest and worker with correct content types and
cache headers. An update-ready prompt lets the user reload intentionally rather
than replacing the active client mid-edit.

### 5.2 Caching boundaries

The Service Worker precaches only build assets and the application shell.
Runtime strategies are:

- immutable hashed assets: cache first;
- map tiles and public place imagery: stale while revalidate with bounded
  expiration;
- navigation: network first with the app shell as an offline fallback;
- authenticated API GETs: network first, with per-user snapshots stored in
  IndexedDB by application code, not shared Cache Storage;
- authentication, mutation, Agent streams, upload, and WebSocket routes: never
  cached by the Service Worker.

Logout removes the current user's snapshots, mutation queue, and reservation
drafts. Data keys include the authenticated user id and trip id so accounts
cannot read each other's cached data on a shared device.

### 5.3 Offline read model

After each successful trip or reservation fetch, the client stores a versioned
snapshot in IndexedDB. When the network request fails due to connectivity, the
planner loads the matching snapshot and labels it with its last synchronized
time. Server HTTP errors such as 401, 403, or 500 do not silently fall back to
offline data.

### 5.4 Mutation queue

Supported offline operations include trip rename, stop/day/comment/vote
operations, expense operations, and reservation create/update/cancel/delete.
Uploads, invitation management, authentication changes, and Agent requests
require connectivity.

Each queued command contains:

```text
queueId, idempotencyKey, userId, tripId, operation, payload,
baseRevision, createdAt, attempts, lastError
```

Optimistic reducers update the local snapshot immediately. Commands are replayed
in creation order per trip while different trips may synchronize independently.
The queue pauses on authentication failure, permission loss, validation error,
or revision conflict. Transient network and 5xx failures use capped exponential
backoff with jitter. A successful response replaces optimistic data with the
server DTO and removes the command.

Background Sync may trigger replay where supported, but correctness never
depends on it. App startup, `online`, visibility regain, and WebSocket reconnect
also start synchronization.

### 5.5 Conflict handling

The client never silently overwrites a newer server revision. On `409`, it
shows a conflict dialog containing:

- the local pending change;
- the current server value;
- discard local change;
- reapply the local edit against the latest revision when the operation is
  safely repeatable.

Delete/edit and permission conflicts require manual discard; they are not
automatically rebased. Other queued commands for the same trip remain paused
until the conflict is resolved.

## 6. Mobile interaction design

The planner keeps desktop split panes and introduces a narrow-screen shell:

- primary modes use a bottom navigation bar with Map, Schedule, Reservations,
  and Budget;
- the active mode retains its scroll position when switching;
- details and forms use full-height dialogs with safe-area padding;
- the map uses an overlay search control and a bottom detail surface;
- the realtime member cluster remains compact and does not cover primary map
  controls;
- offline and queue state appears in one status surface above bottom
  navigation, not as repeated toasts.

Status copy is centralized in the planner locale files. Icons supplement but do
not replace text for offline, conflict, and failure states. Successful routine
synchronization is silent; a brief confirmation appears only after replaying a
visible offline queue.

## 7. Data flow

### Online command

```text
UI -> HTTP command -> application use case -> domain aggregate
   -> SQL repository commit -> TripChange publisher -> Durable Object
   -> WebSocket clients -> scoped React Query invalidation -> fresh HTTP read
```

### Offline command

```text
UI -> optimistic snapshot reducer -> IndexedDB command queue
   -> connectivity returns -> ordered HTTP replay with idempotency key
   -> server commit -> authoritative DTO -> local snapshot replacement
   -> normal realtime publication to other clients
```

### Realtime recovery

```text
socket reconnect -> client sends last sequence
   -> DO replays bounded missing events
   -> gap outside retained window -> resync_required
   -> client refetches full trip and reservations
```

## 8. Error and security handling

- WebSocket requests reject untrusted origins, missing sessions, non-members,
  expired grants, oversized messages, and unsupported message types.
- Clients cannot publish business change events through the public socket.
  Changes originate only from authenticated HTTP commands and internal Worker
  calls.
- Connection grants expire quickly and are bound to one trip and user.
- WebSocket attachments contain no session cookie, token, email, or private
  reservation content.
- Broadcast payloads contain invalidation metadata and presence only.
- Reservation confirmation numbers and notes are returned only to authorized
  trip members and are never placed in WebSocket events or logs.
- Queue payloads are local application data; logout cleanup is mandatory.
- Offline mode is clearly indicated so stale data is not mistaken for current
  shared state.

## 9. Verification requirements

The implementation is complete only when all evidence below exists and passes.

### Realtime

- Durable Object unit tests cover hibernation reconstruction, broadcast
  exclusion, multiple tabs, event deduplication, replay, and resync gaps.
- HTTP tests cover upgrade validation, origin validation, authentication, and
  membership authorization.
- An integration test opens two clients on one trip and proves that a mutation
  from one invalidates and refreshes the other without manual polling.
- Wrangler configuration validation proves the binding and migration are in
  the deploy artifact.

### Reservations

- Pure domain tests cover time, money, status transition, and association
  invariants.
- Repository contract tests cover list/create/update/cancel/delete and revision
  conflicts for supported SQL providers.
- HTTP/API documentation and coverage tests include every reservation route.
- UI tests cover grouping, create/edit/cancel/delete, validation, permissions,
  linked schedule indicators, and conflict resolution.

### PWA/offline/mobile

- Production build emits a valid manifest, icons, and registered Service
  Worker.
- Automated tests prove personalized API data is absent from shared runtime
  caches.
- Offline tests cover snapshot loading, optimistic operations, ordered replay,
  duplicate replay, transient retry, auth pause, permission pause, conflict
  resolution, and logout cleanup.
- Browser tests cover installability and core planner use at representative
  phone and desktop widths.
- Accessibility checks cover keyboard navigation, dialog focus management,
  labels, focus visibility, reduced motion, contrast, and touch targets.

### Project gates

- Typecheck, lint, unit tests, API tests, production builds, docs checks, and
  architecture boundary checks pass.
- Product, frontend, backend, API, Cloudflare, and offline documentation are
  updated in the same change set.

## 10. Delivery sequence

1. Establish idempotency/revision foundations and the Cloudflare Durable Object
   realtime channel.
2. Connect existing trip mutations to realtime invalidation and add presence.
3. Add the reservation aggregate, persistence, use cases, HTTP contract, and
   Agent/read-model integration.
4. Add the reservation planner mode and responsive mobile shell.
5. Add PWA assets and safe application-shell caching.
6. Add IndexedDB snapshots, mutation queue, replay, and conflict UI.
7. Complete cross-client, offline, mobile, accessibility, deployment, and
   documentation verification.

This order makes realtime and idempotency available to both reservations and
offline replay instead of building three incompatible synchronization paths.
