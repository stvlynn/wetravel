# FX rates

Internal FX capability used by the budget settle-up UI. Consumers never talk to
a rate vendor directly.

## Entry points

| Consumer | Path | Notes |
| --- | --- | --- |
| Web | `GET /api/fx/rates` | Auth required; query `base` (ISO 4217), optional `quotes` (comma-separated), optional `date` (`YYYY-MM-DD`) |

Returns `FxRatesData`: `{ date, base, provider, rates, fetchedAt }` where `rates`
is a map of quote → units of quote per 1 `base` (always includes `base: 1`).

## Layering

```
HTTP
        → FxService (application) → FxRatesData
                → FxClient.fetchRates (domain port)
                        → CachedFxClient (6h TTL, single-flight, SWR)
                                → FrankfurterClient (maps vendor JSON → snapshot)
```

- **Domain** (`domain/fx`) — `FxRatesQuery`, `FxRatesSnapshot`, and the
  `FxClient` port. No vendor types.
- **Application** — validates currency/date and maps a snapshot to `FxRatesData`.
- **Infrastructure** — Frankfurter HTTP + cache decorator. Swap the innermost
  adapter to change vendors without touching HTTP or the planner UI.

## Caching

- **On-demand only** — a request from the settle-up currency picker may refresh
  upstream. No cron or pre-warm.
- **TTL** — six hours per cache key (`base`, sorted `quotes`, `date|latest`).
- **Single-flight** — concurrent misses for the same key share one upstream call.
- **Stale-while-revalidate** — after TTL expiry the last snapshot is returned
  immediately while a background refresh runs; a failed refresh keeps the stale
  value.

The web client also sets React Query `staleTime` to six hours so the browser does
not re-hit `/api/fx/rates` more often than needed; that does not replace the
server cache.

## Provider

[Frankfurter](https://frankfurter.dev/) v2 (`api.frankfurter.dev`). No API key.
Daily central-bank reference rates (not live market quotes). Suitable for
settle-up display conversion; not for payment execution.

## UI

The budget **Settle up** card lets the viewer pick a display currency. Transfer
amounts convert with the rate table; hovering a transfer row shows a PreviewCard
with the rate, original amount, provider date, and the existing settlement
derivation. Trip balances and expense totals stay in the trip currency.
