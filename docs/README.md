# wetravel/微旅 documentation

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

### Backend (DDD + Hexagonal)

- [backend/README.md](backend/README.md)
- [backend/domain.md](backend/domain.md)
- [backend/api.md](backend/api.md)
- [backend/database.md](backend/database.md)
- [backend/auth.md](backend/auth.md)

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
  api/   Hono backend (DDD + Hexagonal)
deploy/
  cloudflare/  Pages + Workers + Hyperdrive
  docker/      Compose (postgres + api + web)
docs/          this documentation
scripts/       repo tooling (docs:check)
```
