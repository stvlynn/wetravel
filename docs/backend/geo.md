# Geo

Internal geospatial capability used by the trip agent (and future HTTP
consumers). Callers never talk to Nominatim, Overpass, OSRM, or Google Maps
directly.

## Entry points

| Consumer | Path | Notes |
| --- | --- | --- |
| Agent | `placeSearch` | Free-text place search; optional near bias |
| Agent | `placeNearby` | POIs around a coordinate + radius |
| Agent | `placeDetail` | Enrich a place id from search/nearby |
| Agent | `routeCompute` | Ordered waypoints → distance/duration (+ optional geometry) |
| Agent | `routeMatrix` | Origins × destinations travel matrix |
| Agent | `reviewLookup` | Place reviews when the provider supports them |

All tools are read-only and skip `toolApproval`. Inserting a found place into a
trip still goes through `insertStop` (trip ops registry) and member approval.
See [agent.md](./agent.md).

## Layering

```
Agent read tools
        → GeoService (application) → stable DTOs
                → GeoProvider (domain port)
                        → OsmGeoProvider | GoogleGeoProvider
```

- **Domain** (`domain/geo`) — vendor-neutral place/route/review types and the
  `GeoProvider` port (`placeSearch`, `placeNearby`, `placeDetail`,
  `routeCompute`, `routeMatrix`, `reviewLookup`). Coordinates stay `lat`/`lng`.
- **Application** — validates limits, coordinates, and travel modes; maps port
  results to DTOs; raises `DomainError` for bad input and lets adapters raise
  `GeoError` for upstream/config failures.
- **Infrastructure** — provider adapters + shared cache/rate-limit/HTTP helpers.
  `GEO_PROVIDER=osm|google` selects the implementation in
  `createGeoProvider` at composition time.

## Providers

### OSM (default)

| Capability | Upstream |
| --- | --- |
| `placeSearch` / `placeDetail` | Nominatim `/search`, `/lookup` |
| `placeNearby` | Overpass `around:` + `out center` |
| `routeCompute` / `routeMatrix` | OSRM `/route/v1`, `/table/v1` |
| `reviewLookup` | Unsupported (`supported: false`) |

Base URLs and `GEO_OSM_USER_AGENT` are configurable so self-hosted Nominatim /
Overpass / OSRM can replace the public endpoints without code changes.

### Google

| Capability | Upstream |
| --- | --- |
| search / nearby / detail / reviews | Places API (New) |
| route / matrix | Routes API v2 (`computeRoutes`, `computeRouteMatrix`) |

Requires `GOOGLE_MAPS_API_KEY` when `GEO_PROVIDER=google`.

## Caching and pacing

- **On-demand only** — agent tool calls may refresh upstream. No cron.
- **TTL** — default 30 minutes per cache key (provider + operation + rounded
  inputs).
- **Single-flight + SWR** — concurrent misses share one upstream call; expired
  entries return stale while refreshing.
- **OSM rate limits** — Nominatim ~1 req/s and soft Overpass pacing via a
  token bucket, plus required User-Agent.

## Configuration

See `.env.example`:

| Variable | Default | Notes |
| --- | --- | --- |
| `GEO_PROVIDER` | `osm` | `osm` or `google` |
| `GEO_OSM_NOMINATIM_URL` | public Nominatim | |
| `GEO_OSM_OVERPASS_URL` | public Overpass interpreter | |
| `GEO_OSM_OSRM_URL` | public OSRM demo | |
| `GEO_OSM_USER_AGENT` | OpenTrip identifying UA | Required for public OSM etiquette |
| `GEO_TIMEOUT_MS` | `12000` | Upstream abort timeout |
| `GEO_CACHE_TTL_MS` | `1800000` | 30 minutes |
| `GOOGLE_MAPS_API_KEY` | unset | Required when provider is `google` |

`GeoError` codes: `geo_not_configured` → `503`, `geo_timeout` → `504`, other
upstream failures → `502`.

## Provider notes

- **OSM coordinate order** — tool/DTO inputs are `lat`/`lng`; OSRM paths use
  `longitude,latitude`.
- **Overpass centroids** — nearby queries use `out center` so ways/relations
  return usable POI coordinates.
- **Nominatim** — requests use `format=jsonv2` with `addressdetails`,
  `extratags`, `namedetails`, and `accept-language` when available.
- **Google Places field masks** — search/nearby masks are prefixed with
  `places.`; Place Details masks are unprefixed (`displayName`, `reviews`, …).
- **Google Routes field masks** — `computeRoutes` requires
  `routes.distanceMeters,routes.duration,…`; matrix elements use
  `originIndex,destinationIndex,condition,distanceMeters,duration`.
- **OSM reviews** — always `supported: false`; use Google when reviews matter.
- **Transit on OSM** — public OSRM demos have no transit profile; the adapter
  falls back to the driving profile for `mode=transit`.
