# Map (mapcn / MapLibre)

Reference: [../reference/frontend-sources.md](../reference/frontend-sources.md).
The wrapper lives at `apps/web/src/shared/ui/map` and reproduces the prototype's
`trip-map.js` behavior with a mapcn-style React API on top of `maplibre-gl`.

## Component API

```tsx
<TripMap
  stops={stops}         // MapStop[]
  day={day}             // 0 = all days, or 1..N
  activeStopId={id}     // focused stop
  onSelectStop={(id) => ...}
  picking={picking}     // point-picking mode
  onPick={(lng, lat) => ...}
  onContext={(lng, lat) => ...} // right-click / long-press coordinate
  fallbackCenter={pt}   // optional; empty trip opens near this point
/>
```

`MapStop`: `{ id, name, lat, lng, day, color, num, transit }`.

## Point picking

When `picking` is true the canvas cursor becomes a pushpin and the next map
click resolves to a coordinate via `onPick(lng, lat)`. The planner uses this to
let users place a stop on the map instead of typing its name; the coordinate is
reverse-geocoded (Photon) to prefill a name and area. See
[../reference/frontend-sources.md](../reference/frontend-sources.md) for the
geocoding source.

## Context menu

`TripMap` reports right-click / long-press coordinates via `onContext(lng, lat)`.
`TripMapView` wraps the canvas in the coss `ContextMenu` primitive (Base UI) and
offers pointer-anchored actions: **Add a stop here** (opens the schedule composer
pre-filled at that point, reverse-geocoded for a name) and **Copy coordinates**.

## Behavior

- **Basemap**: CARTO positron GL style (free, light).
- **Markers**: circular numbered pins colored by day; `transit` stops render as
  rounded squares. Hover scales up; the active stop scales further with a
  cornflower ring.
- **Routes**: one line per day (white casing + colored line) connecting that
  day's stops in order.
- **Focus**: selecting a stop flies to it and opens a name popup.
- **Fit**: when no stop is active, the map fits bounds to the visible stops.
- **Empty trip + destination**: create stores geocoded `intake.destinationLat/Lng`
  (via GeoService). `TripMapView` uses those as `fallbackCenter` so the first
  view opens near the destination. If coords are missing, it falls back to a
  Photon geocode of the destination label. Trips with no destination open on a
  neutral world view (not a Japan-centric default).
- **Day filter**: `day = 0` shows all; otherwise only that day's stops/routes.
- **Selection event**: clicking a marker calls `onSelectStop(id)`.

## Loading and failure

- `maplibre-gl` is loaded with the app bundle; its CSS is imported once.
- If the style/tiles fail (e.g. offline), the container shows a muted
  "Map unavailable offline" message instead of a blank canvas — no silent
  fallback that hides the failure.

## Data source

The planner passes stops from the trip API, colored per day. Coordinates and
day colors match the seed data described in
[../backend/domain.md](../backend/domain.md).
