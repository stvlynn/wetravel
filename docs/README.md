# OpenTrip documentation

Travel Planner SaaS — plan trips together, split everything.

## Map

### Project

- [project/README.md](project/README.md) — product overview and scope.
- [project/architecture.md](project/architecture.md) — system architecture.
- [project/handoff-implementation.md](project/handoff-implementation.md) —
  prototype-to-product mapping.

### Frontend (FSD)

- [frontend/README.md](frontend/README.md)
- [frontend/layers.md](frontend/layers.md)
- [frontend/ui-system.md](frontend/ui-system.md)
- [frontend/map.md](frontend/map.md)
- [frontend/i18n.md](frontend/i18n.md)
- [frontend/data-caching.md](frontend/data-caching.md) — React Query write-echo
  (Hyperdrive read-after-write)
- [frontend/miniapp.md](frontend/miniapp.md) — Taro WeChat Mini Program client,
  bearer auth, FSD boundaries, and local development.

### Client API (web, mobile, other apps)

Start here for multi-client development:

- **[backend/api/README.md](backend/api/README.md)** — client HTTP contract index
  (routes, envelopes, DTOs, multi-client notes; split by resource)
- [backend/auth.md](backend/auth.md) — Better Auth mount, cookies/session, OAuth

### Backend (DDD + Hexagonal)

- [backend/README.md](backend/README.md)
- [backend/domain.md](backend/domain.md)
- [backend/api/README.md](backend/api/README.md) — client-facing HTTP contract and DTOs
- [backend/database.md](backend/database.md)
- [backend/auth.md](backend/auth.md)
- [backend/agent.md](backend/agent.md)
- [backend/trip-ops.md](backend/trip-ops.md) — trip mutation registry (HTTP + agent)
- [backend/weather.md](backend/weather.md) — weather proxy, cache, agent tool
- [backend/cover.md](backend/cover.md) — Unsplash trip cover on create
- [backend/fx.md](backend/fx.md) — FX rates proxy for settle-up conversion
- [backend/geo.md](backend/geo.md) — geo places/routes (OSM/Google), agent tools
- [backend/lodging.md](backend/lodging.md) — Airbnb lodging search, agent tools
- [backend/street-view.md](backend/street-view.md) — provider-neutral street-view search, cards, viewer, and agent tools

### Operations and quality

- [operations/README.md](operations/README.md)
- [operations/cloudflare.md](operations/cloudflare.md)
- [operations/docker.md](operations/docker.md)
- [quality/README.md](quality/README.md)
- [decisions/README.md](decisions/README.md)

### Reference sources

- [reference/README.md](reference/README.md)

### Implementation specifications

- [superpowers/README.md](superpowers/README.md)

## Repository layout

```
apps/
  web/   React + Vite frontend (FSD)
  miniapp/ Taro + React WeChat Mini Program frontend (FSD)
  api/   Hono backend (DDD + Hexagonal)
packages/
  agent-ui-catalog/  shared json-render catalog and spec safety boundary
deploy/
  cloudflare/  Pages + Workers + Hyperdrive
  docker/      Compose (postgres + api + web)
docs/          this documentation
scripts/       repo tooling (docs:check)
```
