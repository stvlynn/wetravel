# OpenTrip — Agentic Coding Guidelines

> Travel Planner SaaS. Read this file first, then follow the documentation map
> below before writing any code. Template inspired by
> [`stvlynn/agentic-coding`](https://github.com/stvlynn/agentic-coding).

---

## Before you start

1. **Read the docs first.** Conventions are documented so agents do not guess.
2. **Ask when boundaries are unclear.** If a requirement, layer boundary, or
   technology choice is ambiguous, ask before proceeding.
3. **Check logs and docs before inventing workarounds.** Do not add fallback
   logic to bypass a problem you have not understood.

---

## Tech stack

- Monorepo: `pnpm` workspaces, TypeScript strict everywhere.
- Frontend: React + TypeScript + Vite, Feature-Sliced Design (FSD v2.1).
- UI: cossUI primitives (Base UI + CVA style), cossUI design tokens.
- Map: mapcn-style MapLibre GL wrapper.
- Backend: Hono + TypeScript, Domain-Driven Design + Hexagonal architecture.
- Database: PostgreSQL.
- Auth: Better Auth (email + password).
- Deploy: Cloudflare (Pages + Workers + Hyperdrive) and Docker Compose.

---

## Documentation map

### Understand the project

- [`docs/README.md`](docs/README.md) — top-level index.
- [`docs/project/README.md`](docs/project/README.md) — product overview.
- [`docs/project/architecture.md`](docs/project/architecture.md) — architecture.
- [`docs/project/handoff-implementation.md`](docs/project/handoff-implementation.md) — prototype-to-product mapping.

### Frontend (FSD)

- [`docs/frontend/README.md`](docs/frontend/README.md)
- [`docs/frontend/layers.md`](docs/frontend/layers.md)
- [`docs/frontend/ui-system.md`](docs/frontend/ui-system.md)
- [`docs/frontend/map.md`](docs/frontend/map.md)

### Backend (DDD)

- [`docs/backend/README.md`](docs/backend/README.md)
- [`docs/backend/domain.md`](docs/backend/domain.md)
- [`docs/backend/api.md`](docs/backend/api.md)
- [`docs/backend/database.md`](docs/backend/database.md)
- [`docs/backend/auth.md`](docs/backend/auth.md)
- [`docs/backend/agent.md`](docs/backend/agent.md)
- [`docs/backend/trip-ops.md`](docs/backend/trip-ops.md) — trip mutation registry
- [`docs/backend/weather.md`](docs/backend/weather.md) — weather proxy and cache
- [`docs/backend/fx.md`](docs/backend/fx.md) — FX rates proxy for settle-up conversion
- [`docs/backend/geo.md`](docs/backend/geo.md) — geo places/routes and agent tools

### Operations and quality

- [`docs/operations/README.md`](docs/operations/README.md)
- [`docs/operations/cloudflare.md`](docs/operations/cloudflare.md)
- [`docs/operations/docker.md`](docs/operations/docker.md)
- [`docs/quality/README.md`](docs/quality/README.md)
- [`docs/decisions/README.md`](docs/decisions/README.md)

### Reference sources

- [`docs/reference/README.md`](docs/reference/README.md)

---

## Language and quality rules

- **English only** for code, comments, identifiers, and commit messages.
- **No hardcoded user-facing strings** scattered across components — centralize
  copy in a single place per surface and reference by identifier.
- **No redundant UI copy** — do not repeat what a title, icon, or state conveys.
- **No duplicated implementations** — reuse or extract to the right layer.
- **No fallback/clever bypass logic** — face the root cause or ask.

---

## Frontend: Feature-Sliced Design

- Imports go only downward: `app` -> `pages` -> `widgets` -> `features` ->
  `entities` -> `shared`.
- Pages First: keep page-specific logic in the page until reuse emerges.
- Each slice exposes a public API via `index.ts`; never import slice internals.

See [`docs/frontend/README.md`](docs/frontend/README.md).

## Backend: Domain-Driven Design

- Dependencies point inward: `interfaces` -> `application` -> `domain`;
  `infrastructure` implements `domain` ports.
- Keep controllers thin: parse input, call a use case, format output.

See [`docs/backend/README.md`](docs/backend/README.md).

## Database: Prisma

- **Every database schema change must ship its snapshot.** `apps/api/prisma/schema.prisma`
  is the committed snapshot of the database structure. If a change touches the
  schema, the same change set must include an updated `schema.prisma` produced by
  command — never by hand.
- **Never edit `schema.prisma` by hand.** Always regenerate it from the live
  database with `make db-pull` (alias `make db-snapshot`). If you used
  `make db-migrate-dev` to create a migration, run `make db-pull && make db-generate`
  afterwards and commit both the migration directory and the updated snapshot.
- **Never hand-write migrations.** Create migration files with
  `pnpm --filter @opentrip/api db:migrate-dev` (or `make db-migrate-dev`).
- **Generate the client after every schema change.** Run `make db-generate`
  (equivalent to `pnpm --filter @opentrip/api db:generate`) after pulling or
  migrating.
- **Configuration lives in `apps/api/prisma.config.ts`.** It points to the
  schema, migrations directory, and seed command; `DATABASE_URL` is loaded from
  the root `.env` loaded from `prisma.config.ts` (and `tsx --env-file-if-exists`
  for reset/seed scripts).
- **Use the pg driver adapter.** Construct `PrismaClient` with `PrismaPg`
  (`@prisma/adapter-pg`) and a `pg.Pool`. Use `createPrismaClient` in
  `infrastructure/persistence/prisma.ts`.
- **Seed via `prisma/seed.ts`.** Run `make db-seed` or
  `pnpm --filter @opentrip/api db:seed`.
- **Reset via `make db-reset`.** Drops the `public` schema, reapplies Prisma
  migrations, and re-seeds.

Legacy plain-SQL migrations remain in `apps/api/migrations/` for historical
reference; new schema changes go through Prisma Migrate.

See [`docs/backend/database.md`](docs/backend/database.md).

---

## Commit conventions

[Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>): <subject>` — e.g. `feat(budget): add settlement use case`.

---

## Self-evolution rule

After completing a task, update the relevant docs in the same change set when
product behavior, architecture, configuration, or conventions change.
