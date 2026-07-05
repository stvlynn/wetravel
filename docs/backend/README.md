# Backend (DDD + Hexagonal)

The backend (`apps/api`) is a Hono + TypeScript app following Domain-Driven
Design and Hexagonal architecture. Reference:
[../reference/backend-sources.md](../reference/backend-sources.md).

## Layers and dependency direction

```
interfaces  ->  application  ->  domain
                                   ^
infrastructure  --- implements ----|
```

- **domain** (`src/domain`) — aggregates, entities, value objects, domain
  services, and repository ports. No framework/DB/transport imports.
- **application** (`src/application`) — use cases orchestrating the domain
  through ports; returns DTOs.
- **infrastructure** (`src/infrastructure`) — PostgreSQL repository adapters,
  the database pool, Better Auth, filesystem/S3 storage adapters, and runtime
  composition (Node + Workers).
- **interfaces** (`src/interfaces/http`) — Hono routes: parse input, call a use
  case, format output. Thin.

## Composition

`infrastructure/composition` builds a `Container` (pool + repositories + use
cases). Two entry points share it:

- `src/node-server.ts` — `@hono/node-server` for Docker/local.
- `src/worker.ts` — Workers `fetch` entry for Cloudflare (connection string
  from the Hyperdrive binding).

Both entry points inject storage through an application port. Node supports
explicit `fs` or `s3` configuration; Workers require `s3` so their dependency
graph never imports the Node filesystem adapter.

## Related

- [domain.md](domain.md) — the model and business rules.
- [api.md](api.md) — routes and contracts.
- [database.md](database.md) — schema, migrations, seed.
- [auth.md](auth.md) — Better Auth integration.
