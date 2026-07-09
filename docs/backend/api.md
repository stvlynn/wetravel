# API

Hono routes under `apps/api/src/interfaces/http`. Reference:
[../reference/backend-sources.md](../reference/backend-sources.md).

## Conventions

- Base path: `/api`. Auth: `/api/auth/*` (Better Auth).
- JSON only. Success envelope: `{ "data": <payload> }`.
- Error envelope: `{ "error": { "code": string, "message": string } }`.
- Status codes: `200` ok, `400` validation, `401` unauthenticated,
  `403` forbidden (member lacks permission, e.g. a viewer attempting an edit),
  `404` not found, `409` conflict (agent suggestion already resolved or stale),
  `413` upload too large, `500` unexpected.
- Business routes require an authenticated session; unauthenticated -> `401`.
  Trip routes additionally require membership: non-members get `404` (existence
  is not leaked) and read-only viewers attempting a mutation get `403`.
  The invite preview (`GET /api/trip-invites/:token`) is the one public
  business route so unauthenticated invitees can see what they were invited to.
- Input is validated with `zod` at the edge before reaching a use case.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness probe `{ data: { status: "ok" } }` |
| GET | `/api/weather` | Forecast/observed weather for `lat`, `lon`, `date` (`YYYY-MM-DD`), optional `time` (`HH:MM`) and `lang`. Returns `WeatherData` or `null`. Same `WeatherService` as the agent `checkWeather` tool; provider calls are cached ~1h per location. See [weather.md](./weather.md) |
| GET | `/api/fx/rates` | Latest (or dated) FX rate table for `base` (ISO 4217), optional `quotes` (comma-separated), optional `date` (`YYYY-MM-DD`). Returns `FxRatesData`. Provider calls are cached ~6h per base/quotes/date. See [fx.md](./fx.md) |
| GET | `/api/trips` | List trip summaries the current user may see (member of, plus legacy/demo trips); each carries `createdAt` (ISO), `creatorName`, and `members` (avatar fields, ordered creator-first) for the card's avatar stack and "created …" label |
| POST | `/api/trips` | Create a trip `{ title, currency? }`; owner becomes first member (role `owner`) |
| GET | `/api/trips/:id` | Full trip (members, days, stops, expenses, budget, and the caller's `permissions`); members the caller is not part of return `404` |
| PATCH | `/api/trips/:id` | Rename a trip `{ title }` |
| POST | `/api/trips/:id/days` | Append an empty itinerary day (next number, cycled color) |
| PATCH | `/api/trips/:id/days/:number` | Update an itinerary day's structured metadata `{ date?, city?, dateLabel? }`; `date` is ISO `YYYY-MM-DD`, while `dateLabel` is a legacy fallback for imported data |
| PUT | `/api/trips/:id/days/order` | Reorder itinerary days `{ order }`, where `order` is a permutation of the current day numbers. Days are renumbered `1..N` by their new position: each day keeps its city, legacy label, and stops, while its date and color are recomputed from the new position; stops are remapped to their day's new number, preserving per-day order |
| POST | `/api/trips/:id/media` | Upload a PNG/JPEG/WebP image for stop notes as multipart field `file` (maximum 2 MiB). Requires edit permission. Returns `{ url }` pointing at `/api/uploads/trips/...` |
| POST | `/api/trips/:id/stops` | Insert a stop `{ day, index, name, time, duration?, lat?, lng?, area?, category?, cost?, costCurrency?, note? }`; when `lat`/`lng` are provided (geocode or map pick) they are used verbatim, otherwise the position is interpolated from neighbours. `duration` defaults to `1h`, `category` is a `StopCategory`, `cost` a per-person estimate in minor units, `costCurrency` its ISO code (defaults to the trip currency), `note` free-form Markdown (may embed hosted image URLs from the media endpoint) |
| PATCH | `/api/trips/:id/stops/:stopId` | Edit a stop's display metadata `{ name?, time?, duration?, area?, category?, cost?, costCurrency?, note? }` (at least one field). Only provided fields are applied and normalized like insert; a `cost` of 0 clears the cost currency. Positional day changes go through the position endpoint, not here |
| POST | `/api/trips/:id/stops/:stopId/vote` | Toggle current-user vote |
| POST | `/api/trips/:id/stops/:stopId/comments` | Add a comment `{ text }` |
| POST | `/api/trips/:id/expenses` | Add expense `{ description, amount, currency?, category?, payer, participants }`; `currency` is the ISO code for `amount` and defaults to the trip currency; `category` reuses the stop categories (`Sight \| Food \| Stay \| Shopping \| Activity \| Walk \| Park \| Transit \| Plan`) and defaults to `Plan` |
| PATCH | `/api/trips/:id/expenses/:expenseId` | Update expense with the same body shape as POST |
| POST | `/api/trips/:id/invites` | Create an invite `{ accessScope, allowedEmails?, role, canInvite?, expiresAt?, previousToken? }`; requires the caller's `canInvite`. `accessScope` is `anyone \| restricted_emails` (emails required when restricted), `role` is `editor \| viewer`, `expiresAt` is an ISO datetime or null. When `previousToken` is present the new link is issued and that earlier link is revoked (regenerate). Returns `{ url, token, expiresAt }` once |
| GET | `/api/trip-invites/:token` | Public preview of an invite: `{ tripId, tripTitle, inviterName, memberCount, role, accessScope, status, alreadyMember, expiresAt }`. `status` is `usable \| expired \| revoked \| email_restricted` |
| POST | `/api/trip-invites/:token/accept` | Accept an invite (auth required); adds the caller as a member and returns `{ tripId, joined }`. Idempotent for existing members |
| PUT | `/api/users/preferences` | Update current-user UI preferences `{ plannerSidebarWidth: number, plannerSidebarCollapsed: boolean }`; both values are validated |
| PUT | `/api/users/preferences/agent-panel` | Update the agent panel collapsed state `{ collapsed: boolean }` |
| GET | `/api/users/preferences` | Read current-user UI preferences `{ userId, plannerSidebar: { width, collapsed }, agentPanelCollapsed, updatedAt }` |
| GET | `/api/agent/status` | Whether the trip agent is enabled in this deployment `{ enabled }` |
| GET | `/api/trips/:tripId/agent/messages` | Shared agent session history `{ messages, suggestions }` (members only; `404` when AI is not configured) |
| POST | `/api/trips/:tripId/agent/messages` | Post a plain member message `{ text }` into the shared session. Every message is read; returns `{ addressed }` — when the agent was explicitly `@agent`-mentioned or later judges itself addressed, an ambient reply is generated in the background and arrives via polling |
| POST | `/api/trips/:tripId/agent/chat` | Stream an agent reply (AI SDK UI message stream, not the `{ data }` envelope). Body `{ messages }` is the live UI message turn (required for tool-approval continuation); legacy `{ message }` is still accepted. Server persists new user text (and the finished assistant message) using the client UIMessage ids so the panel can dedupe live vs history, and rebuilds model context from the shared session |
| GET | `/api/trips/:tripId/agent/events?after=<seq>` | Polling endpoint: `{ latestSeq, messages, suggestions }` with messages after the cursor plus pending/recently-changed suggestions (dismissed ones are hidden per user) |
| POST | `/api/trips/:tripId/agent/suggestions/:id/approve` | Approve or deny a proactive suggestion using the AI SDK approval DTO `{ id?, approved, reason? }`. `approved: true` applies the patch (edit permission, `409` when stale/expired/resolved) and returns the trip; `approved: false` dismisses the toast for this user only |
| POST | `/api/trips/:tripId/agent/suggestions/:id/apply` | Alias for approve with `approved: true` (body may omit `approved`) |
| POST | `/api/trips/:tripId/agent/suggestions/:id/dismiss` | Alias for approve with `approved: false` |
| POST | `/api/users/avatar` | Upload the current user's PNG/JPEG/WebP avatar as multipart field `avatar` (maximum file size 2 MiB); updates Better Auth and cleans up the previous managed avatar |
| DELETE | `/api/users/avatar` | Remove the current user's managed avatar and clear the Better Auth image field |
| GET | `/api/uploads/*` | Public immutable delivery for managed uploads (avatars under `avatars/…`, trip note images under `trips/…`) |

## Dates

The trip DTO carries `startDate` (ISO `YYYY-MM-DD`, or `""` when unknown), and
each day carries `date` (ISO `YYYY-MM-DD`, or `""` when unknown). New trips
default day 1 to the trip start date; appended days derive their date from
`startDate + (day.number - 1)`. Clients localize the ISO value for display.
`dateLabel` remains only as a legacy fallback for imported descriptive labels.
Because day dates are positional, reordering days (`PUT …/days/order`)
resequences each day's date from its new position while its city and stops
travel with it.

## Budget payload

`GET /api/trips/:id` includes a computed `budget`:

```json
{
  "total": 470200,
  "perPerson": 117550,
  "balances": [{ "memberId": "lynn", "paid": 91200, "share": 117550, "net": -26350 }],
  "settlements": [{ "from": "lynn", "to": "sam", "amount": 26350 }]
}
```

Amounts are integer JPY. The frontend formats them; it does not recompute
settlement.

## Health

`GET /api/health` is used by Docker healthchecks and manual verification. It
does not require auth.
