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

## Agent tools and image input

`streetViewSearch` returns compact platform-neutral JSON with explicit
`found`/`empty` and `complete`/`partial` semantics. A successful static-only or
empty result is never a tool failure and does not establish a global provider
coverage gap. Persisted tool output stays JSON-only. Its AI SDK `toModelOutput`
adds trusted English captions from DTO fields and, when a ranked
`supports360=false` image exists, at most one bounded static preview for the
current model step. Panorama-only hits and preview failures stay text-only.
`street_view.search_model_output` logs the attach outcome
(`attached` / `skipped_empty` / `skipped_panorama_only` / `preview_unavailable`).

The agent runtime always executes the first search at 100 m, even if the model
supplies a larger radius. It may retry once at the same center with a radius no
greater than 250 m, and only after a successful `empty` or `partial` result.
These runtime bounds keep dense-area fan-out inside the provider's shared
request/deadline budget; prompt wording alone is not treated as enforcement. A
thrown provider error removes both street-view tools for the rest of that
generation and must not trigger guessed-coordinate retries or be presented as
proof of missing coverage. After a `found` search the model must emit
`StreetViewCard` with a returned id in the same reply rather than replacing the
card with a prose metadata caption.

An explicit Chinese or English street-view request is treated as a high-risk
grounded turn. AI SDK step preparation forces `placeSearch` first unless the
member supplied coordinates, then forces `streetViewSearch`; prompt compliance
alone is not sufficient. The finished response remains server-buffered until
the generated-UI protocol gate confirms a successful `found` or `empty` result
and validates any card against that same result. At most one repair attempt is
allowed, and repair never enables trip write tools.

`StreetViewCard` and `openStreetView` are grounded capabilities: their image id
must appear in a successful street-view tool output in the same assistant
UIMessage. The shared catalog sanitizer applies this rule during streaming,
history rendering, and persistence, so text or an older message cannot smuggle
an opaque id into generated UI.

`streetViewInspect` remains available for another static id from this turn's
search. It also uses async `toModelOutput` for one ordinary static preview. The
application rejects `supports360=true` images before reading bytes, so panorama
content is available only to the member through the card preview and isolated
interactive viewer. No provider URL, token, or base64 is stored in tool output.

`appendStopNote` is a generic approval-gated write op. It appends inside the
Trip aggregate so the agent cannot overwrite note content omitted by the
2,000-character prompt-context limit.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `STREET_VIEW_PROVIDER` | `mapillary`; unset disables street view | unset |
| `MAPILLARY_ACCESS_TOKEN` | provider token, secret | — |
| `STREET_VIEW_TIMEOUT_MS` | Graph/preview timeout | `12000` |
