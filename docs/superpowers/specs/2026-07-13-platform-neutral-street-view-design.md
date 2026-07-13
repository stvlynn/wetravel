# Platform-neutral street-view agent integration

**Status:** Approved on 2026-07-13

## Goal

Add street-level imagery as a reusable product capability. The trip agent can
find imagery near a place, present a trusted static preview through json-render,
open an interactive 360-degree viewer, and append an imagery reference to an
itinerary stop note. The planner map exposes the same viewer from its context
menu.

Mapillary is the first provider. Agent-facing tools, application contracts,
json-render components, note writes, and map interactions use street-view
language and do not expose Mapillary-specific concepts.

## Scope

This change includes:

- a provider-neutral street-view port, service, and DTOs;
- a Mapillary server adapter and isolated MapillaryJS browser adapter;
- read-only AI SDK tools for search and visual inspection;
- a trusted json-render street-view card and open-viewer action;
- a shared 360-degree dialog used by agent replies and the map;
- a map context-menu action that finds the nearest image;
- a generic, approval-gated append-to-stop-note trip operation;
- authenticated trip-scoped HTTP endpoints and preview proxying;
- runtime configuration, tests, and documentation.

There is no database schema change. Provider responses, access tokens, and
viewer state are not persisted. Multi-provider aggregation is not included;
the port permits another adapter to replace Mapillary later.

## Documentation basis

Context7 resolved Mapillary to `/mapillary/mapillary-js`, the official
MapillaryJS repository. The indexed documentation confirms:

- `Viewer` is initialized with a browser container and access token;
- an initial `imageId` may be supplied, and `moveTo(imageId)` navigates later;
- `load` and `dataloading` events expose viewer state;
- `viewer.remove()` is the documented disposal path when a viewer is unmounted;
- `GraphDataProvider` also accepts an access token.

The Context7 index is focused on MapillaryJS and does not contain the complete
location-search Graph API reference. Exact server request fields remain inside
the Mapillary adapter and must be verified against the current official Graph
API reference while implementing that adapter. This does not change the
application contract defined below.

Context7 also resolved AI SDK to `/vercel/ai`. Its current tool contract allows
an asynchronous `toModelOutput` transform whose content may combine text and a
binary image file. Street-view inspection uses that boundary: persisted tool
results remain compact JSON, while a single bounded preview is fetched by the
server and supplied to capable vision models only for the current model turn.

## User experience

### Agent reply

The agent first resolves a place to coordinates with the existing geo tools,
then searches for nearby street-level imagery. When a visual answer is useful,
it emits a json-render `StreetViewCard` containing an opaque image id and an
optional human-readable place label.

The card hydrates its preview, capture date, distance, orientation, panorama
support, and required attribution from the authenticated application API. It
does not trust model-generated URLs or attribution. The card may be followed by:

- an **Open street view** action, which opens the shared 360-degree dialog; and
- an **Add to notes** action, which sends a concrete agent follow-up and enters
  the normal write-tool approval flow.

The generated UI remains compact for the agent drawer. Preview failure leaves
metadata and actions visible behind a neutral placeholder.

### Interactive viewer

Agent replies and the map open the same modal dialog. The dialog:

- shows a loading state until MapillaryJS loads the image;
- supports the provider's normal 360-degree navigation controls;
- always renders the provider/contributor attribution supplied by trusted
  application data;
- offers retry on load failure; and
- calls `viewer.remove()` when closed or when its image changes.

MapillaryJS and its access token are confined to the browser viewer adapter.
The dialog surface depends on a provider-neutral viewer controller.

### Map context menu

When street view is configured, the planner map context menu includes **Open
street view**. Selecting it searches from the clicked coordinate, requests one
nearest result within the service default radius, and opens that result.

The menu item shows an in-place loading state. A later right-click cancels any
older unfinished search. No nearby imagery is a normal empty state reported by
an informational toast. When street view is not configured, the menu item is
absent.

### Stop notes

Street-view references are appended as Markdown containing a same-origin
preview URL, capture metadata, attribution, and an opaque image reference. They
do not contain the provider access token or a provider CDN URL.

The write uses a new generic `appendStopNote` trip operation instead of
`updateStop`. Agent prompt context truncates notes after 2,000 characters, so a
replacement write could accidentally discard unseen content. The append
operation preserves the complete current note inside the aggregate, enforces
the existing 20,000-character limit, and requires normal AI SDK user approval.

## Architecture

Dependencies continue to point inward:

```text
interfaces / AI SDK / browser UI
              |
              v
     application/street-view
              |
              v
       domain/street-view
              ^
              |
infrastructure/street-view/mapillary
```

### Domain

`apps/api/src/domain/street-view/` owns:

- `StreetViewProvider`, the driven port;
- `StreetViewImage` and `StreetViewImageId`;
- search and image queries expressed with coordinates, radius, and limit; and
- provider-neutral failure categories where a typed domain error is needed.

`StreetViewImageId` is an opaque string to every caller. The first adapter may
internally use the Mapillary image id, but no caller may parse it or describe
its provider-specific meaning.

The normalized image contains:

- id and coordinate;
- distance from the requested coordinate when returned by search;
- capture time;
- camera heading when known;
- whether interactive panorama navigation is supported;
- provider-controlled preview source data, kept behind the adapter/service; and
- trusted attribution text and optional attribution URL.

### Application

`apps/api/src/application/street-view/` owns `StreetViewService` and public
DTOs. It validates coordinates, clamps radius and result limits, invokes the
provider, orders search results by distance, and creates same-origin,
trip-scoped preview URLs.

The service exposes:

- `searchNearby({ tripId, lat, lng, radiusMeters?, limit? })`;
- `getImage({ tripId, imageId })`; and
- an internal preview read used by the HTTP adapter.

Search defaults and maxima are application policy rather than Mapillary
constants. The initial design uses a 100-metre default radius, a 1-kilometre
maximum radius, five default results, and ten maximum results.

### Infrastructure

`apps/api/src/infrastructure/street-view/mapillary/` implements the driven
port. It owns Graph API URLs, authorization, field selection, response parsing,
distance calculation inputs, thumbnail retrieval, timeouts, and conversion of
provider failures into application errors.

Nearby search is density-safe. The adapter divides larger bounds into bounded
cells and recursively subdivides only when Mapillary explicitly reports that a
cell requests too much data. Panorama and general-image lanes share a deadline
and request budget; successful cells are merged and deduplicated. Incomplete
regional coverage returns `partial`, while unrelated upstream errors are not
misclassified as density or absence of imagery.

The composition root selects the adapter from `STREET_VIEW_PROVIDER`. The
initial accepted value is `mapillary`; an unset value disables the capability.
`MAPILLARY_ACCESS_TOKEN` is required when that provider is selected.

The web application isolates `mapillary-js` behind a provider-specific viewer
adapter. Other planner and agent components depend only on the shared viewer
controller and opaque image id.

## Application and HTTP contracts

The trip-scoped HTTP surface is:

```text
GET /api/trips/:tripId/street-view/images?lat=&lng=&radiusMeters=&limit=
GET /api/trips/:tripId/street-view/images/:imageId
GET /api/trips/:tripId/street-view/images/:imageId/preview
GET /api/trips/:tripId/street-view/viewer-config
```

Every route requires an authenticated trip member. Search and image metadata use the
normal JSON envelope. The preview route proxies provider bytes, supplies a
correct content type, and sets bounded private cache headers. Viewer config is
returned only to authenticated members and contains the minimum information
needed by the isolated browser adapter.

The public image DTO includes only platform-neutral fields:

```ts
interface StreetViewImageDto {
  id: string;
  coordinate: { lat: number; lng: number };
  distanceMeters?: number;
  capturedAt?: string;
  headingDegrees?: number;
  supports360: boolean;
  previewUrl: string;
  attribution: { label: string; url?: string };
}

interface StreetViewSearchResultDto {
  outcome: "found" | "empty";
  completeness: "complete" | "partial";
  panoramaAvailable: boolean;
  panoramaCount: number;
  candidateCount: number;
  images: StreetViewImageDto[];
}
```

## Agent tools

The explicit and ambient read-tool sets include search whenever street view is
configured. Visual inspection is available only for ordinary static imagery:

```text
streetViewSearch({ lat, lng, radiusMeters?, limit? })
streetViewInspect({ imageId })
```

The descriptions instruct the model to resolve place names through
`placeSearch` or `placeDetail` first, use real coordinates, and prefer the
nearest suitable 360-degree result for the interactive viewer. Both tools are
automatic read tools and do not require approval. Search returns an explicit
`found` or `empty` outcome, the number of panoramas, and normalized images so
the model cannot confuse an empty result or a static-only result with a tool
failure.

`streetViewSearch.execute` returns JSON metadata only for persistence and the
UI. Its asynchronous `toModelOutput` adds trusted captions from those fields
and, when a ranked ordinary static image exists, at most one JPEG/PNG/WebP
preview for the current model step so the model can emit `StreetViewCard`
without inventing metadata. Panorama-only results stay text-only.
`streetViewInspect.execute` returns the same compact, platform-neutral JSON.
Before its asynchronous `toModelOutput` reads bytes, the application verifies
that the image is not a panorama. For an ordinary static image it adds caption
text plus one preview file fetched through the trusted provider adapter. For a
panorama it throws `street_view_panorama_inspection_forbidden`; panorama bytes
are never supplied to the model. Static images are limited to 2 MiB, requested
at approximately 1024 pixels, and guarded by the provider timeout. Provider
URLs, tokens, and base64 are never included in the execute result.

The Mapillary adapter performs separate bounded panorama and general candidate
queries, merges them by opaque image id, and tolerates one successful lane when
the other fails. The application filters the rectangular provider result back
to the requested circular radius, ranks panoramas before ordinary images, then
uses distance, capture time, and id as deterministic tie breakers before
applying the caller's limit. This keeps provider-specific search behavior out
of the application contract while preventing an upstream limit from hiding a
nearby panorama.

`appendStopNote({ stopId, markdown })` is added to the trip operation registry.
It is generic, always requires user approval, is not eligible for proactive
application, and appends through the Trip aggregate and repository. The street
view system prompt tells the model to include trusted same-origin preview and
attribution data from a street-view tool result.

Provider names do not appear in tool names, descriptions, input schemas, or
output field names.

## json-render contract

The shared catalog adds:

- `StreetViewCard`, with `imageId` and optional `placeLabel` props; and
- `openStreetView`, with `{ imageId }` params.

The card renderer uses the current trip id from application context to hydrate
trusted data. It does not accept a preview URL, token, arbitrary link, capture
date, or attribution from the generated spec. Existing `ActionButton` elements
may bind `press` to `openStreetView`; **Add to notes** continues to use an
allowlisted `sendAgentFollowUp` action so the subsequent write remains visible
and approval-gated.

The runtime sanitizer permits `openStreetView` only with a bounded non-empty
opaque id. Unknown components, unknown actions, arbitrary navigation, external
URLs, state, repeats, watchers, and action chaining remain rejected.

## Error handling and security

- Missing configuration disables tool registration and hides the map action.
- No image near a coordinate is a successful empty result.
- Provider authentication, authorization, rate limiting, timeout, and upstream
  failures map to stable platform-neutral errors. Raw provider bodies are not
  returned to the model or browser.
- A search exception is the only tool-failure state. Static-only and empty
  searches are successful outcomes and must not be described as provider
  outages or global coverage gaps.
- Panorama preview bytes are available to the browser card/viewer surface but
  are never supplied to the model through `streetViewInspect`.
- Preview failures render a placeholder without suppressing trusted metadata or
  the open action.
- Viewer failures render a retry state and always dispose partial viewer state.
- Preview URLs are same-origin and trip-scoped. json-render never receives a
  provider CDN URL or access token.
- Image ids are validated for bounded length and safe characters before they
  reach the adapter.
- The browser access token required by MapillaryJS is never persisted in agent
  messages, generated specs, notes, logs, or committed configuration.
- Runtime values live in secrets or local ignored environment files. Committed
  examples contain key names and placeholders only.

## Testing

### Domain and application

- validate coordinates, radius, and result limits;
- normalize and order results by distance;
- filter rectangular provider candidates to the requested circular radius;
- prefer panoramas and apply deterministic distance/time/id tie breakers;
- produce platform-neutral DTOs and same-origin preview URLs;
- return explicit found/static-only/empty search semantics; and
- append notes without overwriting existing content or exceeding the aggregate
  note limit.

### Mapillary adapter

- assert request construction and requested fields;
- request bounded panorama and general candidate lanes and merge by id;
- tolerate one failed candidate lane but fail when both lanes fail;
- map geometry, capture time, heading, panorama support, preview, and
  attribution;
- cover empty/malformed responses;
- normalize 401/403, 429, timeout, and 5xx failures; and
- use mocked fetch responses only, with no live Mapillary call in CI.

### AI SDK and trip operations

- register read tools only when the capability is configured;
- send one bounded ordinary static preview through `toModelOutput`;
- reject panorama inspection before reading preview bytes;
- verify read schemas and automatic execution;
- verify `appendStopNote` requires approval and cannot be proactive;
- prove that the write preserves the full previous note; and
- ensure provider-specific names are absent from agent tool contracts.

### HTTP and web

- enforce session and trip membership on every endpoint;
- validate coordinates and image ids;
- cover preview content type and private caching;
- render card loading, success, placeholder, and empty states;
- initialize, navigate, retry, and dispose the viewer adapter;
- cover context-menu loading, success, empty result, and stale-request
  cancellation; and
- preserve existing json-render sanitizer behavior while accepting only the new
  component and action.

## Documentation and configuration changes

Implementation updates:

- `docs/backend/street-view.md` and the backend documentation index;
- `docs/backend/agent.md`;
- `docs/frontend/map.md` and `docs/frontend/ui-system.md`;
- `.env.example`;
- Docker Compose environment forwarding; and
- Cloudflare secret examples and secret synchronization documentation/scripts.

No production endpoint, bucket name, account value, or access token is
committed.
