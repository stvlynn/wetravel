# API

Hono routes under `apps/api/src/interfaces/http`. Reference:
[../reference/backend-sources.md](../reference/backend-sources.md).

## Conventions

- Base path: `/api`. Auth: `/api/auth/*` (Better Auth).
- JSON only. Success envelope: `{ "data": <payload> }`.
- Error envelope: `{ "error": { "code": string, "message": string } }`.
- Status codes: `200` ok, `400` validation, `401` unauthenticated,
  `403` forbidden (member lacks permission, e.g. a viewer attempting an edit),
  `404` not found, `413` upload too large, `500` unexpected.
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
| GET | `/api/trips` | List trip summaries the current user may see (member of, plus legacy/demo trips); each carries `createdAt` (ISO), `creatorName`, and `members` (avatar fields, ordered creator-first) for the card's avatar stack and "created …" label |
| POST | `/api/trips` | Create a trip `{ title, currency? }`; owner becomes first member (role `owner`) |
| GET | `/api/trips/:id` | Full trip (members, days, stops, expenses, budget, and the caller's `permissions`); members the caller is not part of return `404` |
| PATCH | `/api/trips/:id` | Rename a trip `{ title }` |
| POST | `/api/trips/:id/days` | Append an empty itinerary day (next number, cycled color) |
| PATCH | `/api/trips/:id/days/:number` | Update an itinerary day's structured metadata `{ date?, city?, dateLabel? }`; `date` is ISO `YYYY-MM-DD`, while `dateLabel` is a legacy fallback for imported data |
| PUT | `/api/trips/:id/days/order` | Reorder itinerary days `{ order }`, where `order` is a permutation of the current day numbers. Days are renumbered `1..N` by their new position: each day keeps its city, legacy label, and stops, while its date and color are recomputed from the new position; stops are remapped to their day's new number, preserving per-day order |
| POST | `/api/trips/:id/stops` | Insert a stop `{ day, index, name, time, lat?, lng?, area?, category?, cost?, costCurrency?, note? }`; when `lat`/`lng` are provided (geocode or map pick) they are used verbatim, otherwise the position is interpolated from neighbours. `category` is a `StopCategory`, `cost` a per-person estimate in minor units, `costCurrency` its ISO code (defaults to the trip currency), `note` free-form Markdown |
| PATCH | `/api/trips/:id/stops/:stopId` | Edit a stop's display metadata `{ name?, time?, duration?, area?, category?, cost?, costCurrency? }` (at least one field). Only provided fields are applied and normalized like insert; a `cost` of 0 clears the cost currency. Positional day changes go through the position endpoint, not here |
| POST | `/api/trips/:id/stops/:stopId/vote` | Toggle current-user vote |
| POST | `/api/trips/:id/stops/:stopId/comments` | Add a comment `{ text }` |
| POST | `/api/trips/:id/expenses` | Add expense `{ description, amount, currency?, payer, participants }`; `currency` is the ISO code for `amount` and defaults to the trip currency |
| POST | `/api/trips/:id/invites` | Create an invite `{ accessScope, allowedEmails?, role, canInvite?, expiresAt? }`; requires the caller's `canInvite`. `accessScope` is `anyone \| restricted_emails` (emails required when restricted), `role` is `editor \| viewer`, `expiresAt` is an ISO datetime or null. Returns `{ url, token, expiresAt }` once |
| GET | `/api/trip-invites/:token` | Public preview of an invite: `{ tripId, tripTitle, inviterName, memberCount, role, accessScope, status, alreadyMember, expiresAt }`. `status` is `usable \| expired \| revoked \| email_restricted` |
| POST | `/api/trip-invites/:token/accept` | Accept an invite (auth required); adds the caller as a member and returns `{ tripId, joined }`. Idempotent for existing members |
| PUT | `/api/users/preferences` | Update current-user UI preferences `{ plannerSidebarWidth: number, plannerSidebarCollapsed: boolean }`; both values are validated |
| GET | `/api/users/preferences` | Read current-user UI preferences `{ userId, plannerSidebar: { width, collapsed }, updatedAt }` |
| POST | `/api/users/avatar` | Upload the current user's PNG/JPEG/WebP avatar as multipart field `avatar` (maximum file size 2 MiB); updates Better Auth and cleans up the previous managed avatar |
| DELETE | `/api/users/avatar` | Remove the current user's managed avatar and clear the Better Auth image field |
| GET | `/api/uploads/*` | Public immutable delivery for managed uploaded avatars |

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
