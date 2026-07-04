# API

Hono routes under `apps/api/src/interfaces/http`. Reference:
[../reference/backend-sources.md](../reference/backend-sources.md).

## Conventions

- Base path: `/api`. Auth: `/api/auth/*` (Better Auth).
- JSON only. Success envelope: `{ "data": <payload> }`.
- Error envelope: `{ "error": { "code": string, "message": string } }`.
- Status codes: `200` ok, `400` validation, `401` unauthenticated,
  `404` not found, `500` unexpected.
- Business routes require an authenticated session; unauthenticated -> `401`.
- Input is validated with `zod` at the edge before reaching a use case.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness probe `{ data: { status: "ok" } }` |
| GET | `/api/trips` | List trip summaries; each carries `createdAt` (ISO), `creatorName`, and `members` (avatar fields, ordered creator-first) for the card's avatar stack and "created …" label |
| POST | `/api/trips` | Create a trip `{ title, currency? }`; owner becomes first member |
| GET | `/api/trips/:id` | Full trip (members, days, stops, expenses, budget) |
| PATCH | `/api/trips/:id` | Rename a trip `{ title }` |
| POST | `/api/trips/:id/days` | Append an empty itinerary day (next number, cycled color) |
| POST | `/api/trips/:id/stops` | Insert a stop `{ day, index, name, time, lat?, lng?, area?, category?, cost?, costCurrency?, note? }`; when `lat`/`lng` are provided (geocode or map pick) they are used verbatim, otherwise the position is interpolated from neighbours. `category` is a `StopCategory`, `cost` a per-person estimate in minor units, `costCurrency` its ISO code (defaults to the trip currency), `note` free-form Markdown |
| POST | `/api/trips/:id/stops/:stopId/vote` | Toggle current-user vote |
| POST | `/api/trips/:id/stops/:stopId/comments` | Add a comment `{ text }` |
| POST | `/api/trips/:id/expenses` | Add expense `{ description, amount, currency?, payer, participants }`; `currency` is the ISO code for `amount` and defaults to the trip currency |

## Dates

The trip DTO carries `startDate` (ISO `YYYY-MM-DD`, or `""` when unknown). New
trips default it to the creation date; each day's calendar date is derived on
the client as `startDate + (day.number - 1)` and localized. Seed trips leave
`startDate` empty and keep their descriptive per-day `dateLabel`.

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
