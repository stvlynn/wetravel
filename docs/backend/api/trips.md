# Trip endpoints

Unless noted, success body is `{ "data": … }` and the tables describe the **payload inside `data`**.

## Trips

### `GET /api/trips`

- **Auth:** session  
- **Response:** `TripSummary[]` — trips the user may see (member of, plus
  legacy/demo). See [TripSummary](./dtos.md#tripsummary).

### `POST /api/trips`

- **Auth:** session  
- **Status:** `201`  
- **Body:**

| Field | Type | Rules |
| --- | --- | --- |
| `title` | string | trim, 1–120 |
| `currency` | string? | optional ISO-ish code, 1–8 chars |
| `startDate` | string? | optional ISO `YYYY-MM-DD` |
| `endDate` | string? | optional ISO `YYYY-MM-DD` (inclusive) |
| `dayCount` | number? | optional integer 1–60 |
| `destination` | string? | optional city/region label, 1–120 |
| `budgetAmount` | number? | optional planned budget (positive) |
| `partySize` | number? | optional planned party size 1–100 |

Omitted optional fields mean “TBD” in the create wizard. When any intake field
is present, the trip is created with `agentSeedPending: true` and an `intake`
object. If `destination` is set and `UNSPLASH_ACCESS_KEY` is configured, the
server searches Unsplash for a landscape cover and stores `coverUrl`. When
`destination` is set, the server also geocodes it via `GeoService` and stores
`intake.destinationLat` / `destinationLng` so the planner map can open near
that place before any stops exist.

Day rows are derived from dates / day count (defaults to one day starting
today). Day 1’s `city` is set from `destination` when provided.

- **Response:** full [`TripDto`](./dtos.md#tripdto-full-trip) (owner is first member).

### `GET /api/trips/:id`

- **Auth:** session + member (`404` if not)  
- **Response:** [`TripDto`](./dtos.md#tripdto-full-trip)

### `PATCH /api/trips/:id`

- **Auth:** session + edit  
- **Body:** one of:
  - `{ title: string }` (trim, 1–120) — rename
  - `{ clearAgentSeedPending: true }` — clear the one-shot agent seed flag after
    the planner has sent the first `@agent` message
- **Response:** [`TripDto`](./dtos.md#tripdto-full-trip)

---

[← API index](./README.md) · [Route index](./routes.md) · [DTOs](./dtos.md)
