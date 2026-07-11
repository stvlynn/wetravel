# Trip cover images (Unsplash)

When a trip is created with a `destination`, `TripService` asks
`CoverImageProvider.searchLandscape(destination)` for a landscape photo URL and
stores it on `trips.cover_url`.

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `UNSPLASH_ACCESS_KEY` | no | Unsplash [Access Key](https://unsplash.com/oauth/applications). When unset, create skips the cover and the trips list keeps the SVG placeholder. Must be a **Worker secret** in production (`gh secret set UNSPLASH_ACCESS_KEY` + sync via `deploy/cloudflare/scripts/sync-secrets.mjs`). |

The provider is server-only (no public HTTP route) to avoid key exposure and
quota abuse. Failures (network, empty results, missing key) return `null` and
do not fail trip creation.

## Behavior

- Query: `{destination} landscape travel`, `orientation=landscape`, first
  `urls.regular`.
- Destination TBD / empty → no Unsplash call.
- List cards (`TripSummary.coverUrl`) render the image with a subtle outline;
  load errors fall back to the route SVG.
