# Database

PostgreSQL (default) or MySQL/MariaDB, selected via env. Runtime repositories
use a dialect-agnostic `SqlClient`. Prisma migrations remain the Postgres source
of truth; MySQL uses a SQL bootstrap. Reference:
[../reference/backend-sources.md](../reference/backend-sources.md).

## Provider switch

| Variable | Values | Notes |
| --- | --- | --- |
| `DATABASE_PROVIDER` | `postgres` (default) · `mysql` | Explicit backend |
| `DATABASE_URL` | connection string | Scheme can also infer provider (`mysql://` → mysql) |

Examples:

```bash
# Postgres (local Docker default)
DATABASE_PROVIDER=postgres
DATABASE_URL=postgres://opentrip:opentrip@localhost:5430/opentrip

# MySQL
DATABASE_PROVIDER=mysql
DATABASE_URL=mysql://opentrip:opentrip@localhost:3306/opentrip
```

On Cloudflare Workers, prefer either:

1. **Worker secret `DATABASE_URL`** (direct connect; use when Hyperdrive TLS
   fails — e.g. some managed MySQL SSL modes), plus vars `DATABASE_PROVIDER`
   and optional `DATABASE_SSL` (`required` | `off` | `verify`), or
2. **Hyperdrive binding** `HYPERDRIVE` (pooling). Worker uses Hyperdrive when
   present, otherwise `DATABASE_URL`.

## Runtime architecture

```
createContainer
  → createSqlClient(provider, url)     # repositories
  → createAuthDatabase(provider, url)  # Better Auth (pg.Pool | mysql2 Pool)
```

Repositories live under `infrastructure/persistence/*-repository.db.ts` and
accept `SqlClient`. Callers write PostgreSQL-style `$1` placeholders; the MySQL
driver rewrites them to `?`. Dialect helpers cover `ON CONFLICT` /
`INSERT IGNORE` / `ON DUPLICATE KEY`, and `ANY($n)` / `IN (?,?,…)`.
(Filenames use `.db.ts`, not `.sql.ts`, so Wrangler does not treat them as raw SQL.)

Prisma Client with `@prisma/adapter-pg` is still available for tooling against
Postgres. Prefer `SqlClient` for app code so both backends stay supported.

## Connection

`DATABASE_URL` in the root `.env` points at the local database container.
Production uses the same URL (or Hyperdrive) on Cloudflare Workers.

```ts
import { createSqlClient } from "../infrastructure/persistence/sql";
import { loadConfig } from "../infrastructure/config";

const config = loadConfig(process.env);
const db = createSqlClient(config.databaseProvider, config.databaseUrl);
```

## Postgres workflow (Prisma)

- `apps/api/prisma.config.ts` — schema path, migrations path, datasource URL,
  and seed command.
- `apps/api/prisma/schema.prisma` — Postgres snapshot. **Do not edit by hand.**
  Regenerate with `make db-pull` / `make db-snapshot` against a Postgres DB.
- `apps/api/prisma/migrations/` — Prisma migration files (Postgres only).
- `apps/api/prisma/seed.ts` — dialect-agnostic seed via `SqlClient`.
- `apps/api/prisma/reset.ts` — drop + migrate/bootstrap + seed for either backend.

```sh
make db-migrate      # prisma migrate deploy (postgres)
make db-seed         # works for both providers
make db-reset        # provider-aware
```

**Rule: every Postgres schema change must ship its snapshot.** If you create or
modify a migration, run `make db-pull` afterwards and commit both.

## MySQL workflow

MySQL does not use Prisma Migrate (schema provider is Postgres). Bootstrap with:

```bash
export DATABASE_PROVIDER=mysql
export DATABASE_URL=mysql://opentrip:opentrip@localhost:3306/opentrip

# Apply schema
pnpm --filter @opentrip/api exec tsx --env-file-if-exists=../../.env \
  prisma/mysql/apply-schema.ts

# Seed demo data
pnpm db:seed

# Or full reset
pnpm db:reset
```

Schema file: [`apps/api/prisma/mysql/schema.sql`](../../apps/api/prisma/mysql/schema.sql).
When you change the Postgres model, update the MySQL bootstrap in the same
change set so both backends stay aligned.

Local MySQL via Compose:

```bash
docker compose -f deploy/docker/compose.yaml --profile mysql up -d mysql
```

## Makefile commands

| Target | Purpose |
|--------|---------|
| `make db-generate` | Generate Prisma Client from `schema.prisma` (Postgres) |
| `make db-pull` / `make db-snapshot` | Introspect Postgres and rewrite `schema.prisma` |
| `make db-push` | Push schema changes to Postgres (dev only) |
| `make db-migrate` | Apply pending Prisma migrations (Postgres) |
| `make db-migrate-dev` | Create a new Prisma migration from schema changes |
| `make db-seed` | Run dialect-agnostic seed |
| `make db-reset` | Provider-aware drop + migrate/bootstrap + seed |
| `make db-init` | Run migrations then seed (Postgres path) |
| `make db-studio` | Open Prisma Studio (Postgres) |

## Business schema

- `trips` — `id`, `title`, `start_date`, `end_date`, `status`, `currency`,
  `owner_id`. New trips store `start_date` as an ISO `YYYY-MM-DD` date so day
  calendar dates can be derived on the client; seed trips use descriptive labels.
- `trip_members` — `id`, `trip_id`, `name`, `short_name`, `initials`,
  `avatar_bg`, `avatar_fg`, `image`, `is_current_user`. `image` is an optional
  avatar URL.
- `trip_days` — `trip_id`, `number`, `date_label`, `city`, `color`. `date_label`
  may be empty for date-derived trips; `POST /api/trips/:id/days` appends a row.
- `stops` — `id`, `trip_id`, `day`, `time`, `duration`, `name`, `area`,
  `category`, `lat`, `lng`, `cost`, `cost_currency`, `created_by`, `transit`,
  `note`, `sort_order`. `note` holds optional Markdown. `cost_currency` is the
  ISO code for `cost`; an empty string means "use the trip currency". Costs are
  display-only and never enter the (expense-based) budget, so mixed currencies
  are safe.
- `stop_votes` — `stop_id`, `member_id` (unique together).
- `stop_comments` — `id`, `stop_id`, `author_id`, `text`, `time_label`,
  `created_at`.
- `expenses` — `id`, `trip_id`, `description`, `payer_id`, `amount`,
  `currency`, `category`, `when_label`, `created_at`. `currency` preserves the
  selected ISO code for display and future FX support. `category` reuses the stop
  category set and defaults to `Plan`.
- `expense_participants` — `expense_id`, `member_id` (unique together).
- `user_preferences` — `user_id` (PK, references `user`), `planner_sidebar_width`,
  `planner_sidebar_collapsed`, `updated_at`. Stores UI chrome such as the
  travel-planner resizable sidebar width and collapsed state.

Amounts are stored as integers in their selected currency. The current budget
algorithm does not convert FX; mixed-currency expenses are persisted/displayed
with their own currency, while aggregate budget math still sums numeric amounts.

## Better Auth tables

Created by the Postgres baseline migration and the MySQL bootstrap so both
backends share the same logical schema. If Better Auth options change,
regenerate for Postgres with the Better Auth CLI, pull into `schema.prisma`,
create a Prisma migration, **and** update `prisma/mysql/schema.sql`. The `user`
table also carries a `defaultCurrency` column (a Better Auth `additionalField`)
surfaced on every session. See [auth.md](auth.md).
