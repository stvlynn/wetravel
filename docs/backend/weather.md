# Weather

Internal weather capability used by the planner UI and the trip agent. Consumers
never talk to a weather vendor directly.

## Entry points

| Consumer | Path | Notes |
| --- | --- | --- |
| Web | `GET /api/weather` | Auth required; query `lat`, `lon`, `date` (`YYYY-MM-DD`), optional `time` (`HH:MM`), optional `lang` |
| Agent | `checkWeather` tool | Calls the same `WeatherService.getWeather`; read-only, no approval |

Both return the application DTO `WeatherData` (or `null` / `{ unavailable: true }`
when no forecast matches). OpenWeather (or any future provider) stays behind the
`WeatherClient` port.

## Layering

```
HTTP / checkWeather
        → WeatherService (application) → WeatherData
                → WeatherClient.fetchForecast (domain port)
                        → CachedWeatherClient (1h TTL, single-flight, SWR)
                                → OpenWeatherMapClient (maps vendor JSON → snapshot)
```

- **Domain** (`domain/weather`) — `WeatherForecastQuery`, `WeatherForecastSnapshot`,
  and the `WeatherClient` port. No vendor types.
- **Application** — selects hourly vs daily windows and maps a snapshot entry to
  `WeatherData`.
- **Infrastructure** — provider HTTP + cache decorator. Swap the innermost
  adapter to change vendors without touching HTTP or agent tools. The OpenWeather
  mapper treats null/missing `weather` (and a missing `data` array) as empty so
  sparse timeline slots return `null` from `getWeather` instead of a 500.

## Caching

- **On-demand only** — a request from the UI (page load / React Query) or from
  `checkWeather` may refresh upstream. No cron or pre-warm.
- **TTL** — one hour per cache key (`granularity`, rounded lat/lon to 0.001°,
  bucketed `start`, `lang`, `count`).
- **Single-flight** — concurrent misses for the same key share one upstream call.
- **Stale-while-revalidate** — after TTL expiry the last snapshot is returned
  immediately while a background refresh runs; a failed refresh keeps the stale
  value.

The web client also sets React Query `staleTime` to one hour so the browser does
not re-hit `/api/weather` more often than needed; that does not replace the
server cache.

## Configuration

`OPENWEATHERMAP_API_KEY` (see `.env.example`). When unset, weather requests fail
with `weather_not_configured` (`503`).
