# Street view

Street view is a provider-neutral application capability. Agent tools, HTTP
DTOs, generated UI, itinerary notes, and map interactions use opaque image ids
and never expose Mapillary-specific URLs or tokens. Mapillary is the first
driven adapter under `infrastructure/street-view/mapillary`.

## Architecture

- `domain/street-view` defines `StreetViewProvider` and normalized contracts.
- `application/street-view` validates inputs, clamps search policy, filters the
  provider bbox to the requested circle, ranks panoramas deterministically,
  and emits trip-scoped same-origin preview URLs.
- the Mapillary adapter owns bounded panorama/general candidate queries,
  adaptive spatial subdivision, deduplication, Graph API parsing, timeouts,
  and the 2 MiB JPEG/PNG/WebP preview boundary.
- `StreetViewCache` keeps normalized metadata and successful preview bytes for
  15 minutes. Workers use `caches.default`; Node uses bounded TTL/LRU memory.
- HTTP routes assert trip membership before returning any data.
- the web keeps MapillaryJS behind the page-private viewer and calls
  `viewer.remove()` on image changes and unmount.

## HTTP

```text
GET /api/trips/:tripId/street-view/images?lat=&lng=&radiusMeters=&limit=
GET /api/trips/:tripId/street-view/images/:imageId
GET /api/trips/:tripId/street-view/images/:imageId/preview
GET /api/trips/:tripId/street-view/viewer-config
```

Search defaults to 100 m and five images. Radius is capped at 1 km and results
at ten. Search responses contain `outcome`, `completeness`, candidate/result
counts, panorama availability, and normalized `images`. Preview responses are
private-cacheable for 15 minutes.

## Dense-area search

Mapillary may reject a large, imagery-dense bounding box with a provider error
asking the caller to reduce the requested data. The adapter prevents this from
becoming a false coverage result:

- search bounds are initially divided into cells no wider than 500 m;
- only the recognized Mapillary data-volume response recursively subdivides a
  cell into four smaller cells;
- panorama and general-image lanes use bounded concurrency, a shared 48-request
  budget, a maximum subdivision depth, and the configured search deadline;
- successful cells are merged and deduplicated before the application applies
  the requested circular radius and ranking policy;
- any skipped or failed cell makes the result `partial`; the adapter throws only
  when neither lane completed a single cell successfully.

Ordinary provider 5xx responses are never treated as density signals. Network,
429, 500, 502, 503, and 504 failures retry once within the shared deadline;
401/403, 404, validation, and media errors never retry. Search logs contain
region, split, attempt, upstream status, completeness, and duration but never
access tokens, response bodies, or provider image URLs.

## Deterministic agent grounding

Street view has one agent path:

1. `StreetViewGroundingService` recognizes the bounded English/Chinese request
   grammar, including a valid coordinate pair. It never asks a model to extract
   a place.
2. A place request calls `GeoService.placeSearch` exactly once with `limit=1`.
   A coordinate request skips geo lookup.
3. A resolved coordinate calls `StreetViewService.searchNearby` exactly once
   with `radiusMeters=100` and `limit=5`. There is no application-level radius
   expansion or alternate strategy. Mapillary's bounded transport retry and
   dense-region subdivision remain internal to its single provider operation.
4. The result is one discriminated outcome: `found`, `empty`,
   `place_not_found`, `invalid_request`, or `service_unavailable`.
5. The AI SDK adapter creates the UIMessage; it does not call `streamText` for
   this turn. Ordinary chat continues to use `streamText` and its normal tools.

“Second” / “第二个” continuation is accepted only when the immediately preceding
assistant message contains a valid persistent `data-agent-grounding` part. The
application never infers this state from assistant prose.

`found` writes localized text, persistent grounding data, and a server-built
flat `StreetViewCard` spec. `empty` writes text and grounding without a card.
Failures write text, grounding, and typed status. A transient
`service_unavailable` result is retryable and includes a structured normalized
request; missing configuration and non-retryable provider errors do not show a
retry action. All agent entry points—streaming chat, ambient replies, and stop
comments—use the same service and deterministic parts.

Only image ids in an `outcome=found` grounding part in the same assistant
UIMessage authorize `StreetViewCard`. Tool parts, assistant text, older
messages, client-submitted control parts, and model-generated specs cannot add
trusted ids. The catalog prompt explicitly forbids the model from generating
street-view UI, and the sanitizer removes an unauthorized card.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `STREET_VIEW_PROVIDER` | `mapillary`; unset disables street view | unset |
| `MAPILLARY_ACCESS_TOKEN` | provider token, secret | — |
| `STREET_VIEW_TIMEOUT_MS` | Graph/preview timeout | `12000` |
