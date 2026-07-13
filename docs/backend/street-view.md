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
  deduplication, Graph API parsing, timeouts, and the 2 MiB JPEG/PNG/WebP
  preview boundary.
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

## Agent tools and image input

`streetViewSearch` returns compact platform-neutral JSON with explicit
`found`/`empty` and `complete`/`partial` semantics. A successful static-only or
empty result is never a tool failure and does not establish a global provider
coverage gap.

`streetViewInspect` reads one trusted ordinary static preview through async AI
SDK `toModelOutput`. The application rejects `supports360=true` images before
reading bytes, so panorama content is available only to the member through the
card preview and isolated interactive viewer. No provider URL, token, or base64
is stored in tool output.

`appendStopNote` is a generic approval-gated write op. It appends inside the
Trip aggregate so the agent cannot overwrite note content omitted by the
2,000-character prompt-context limit.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `STREET_VIEW_PROVIDER` | `mapillary`; unset disables street view | unset |
| `MAPILLARY_ACCESS_TOKEN` | provider token, secret | — |
| `STREET_VIEW_TIMEOUT_MS` | Graph/preview timeout | `12000` |
