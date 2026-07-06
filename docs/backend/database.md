# Database

PostgreSQL with [Prisma](https://www.prisma.io/) as the ORM. Reference:
[../reference/backend-sources.md](../reference/backend-sources.md).

## Connection

`DATABASE_URL` in the root `.env` points at the local Postgres container.
Production uses the same URL supplied via Hyperdrive on Cloudflare Workers.

Prisma 7 uses driver adapters rather than a bundled query engine. The app
constructs `PrismaClient` with the `PrismaPg` adapter over a `pg.Pool`:

```ts
import { createPrismaClient } from "../infrastructure/persistence/prisma";

const prisma = createPrismaClient(process.env.DATABASE_URL);
```

For raw SQL paths (e.g., Better Auth's pg adapter) the shared pool factory in
`infrastructure/persistence/pool.ts` is still available.

## Prisma setup

- `apps/api/prisma.config.ts` — schema path, migrations path, datasource URL,
  and seed command.
- `apps/api/prisma/schema.prisma` — source-of-truth data model. **Do not edit by
  hand.** Regenerate it from the database with `make db-pull` or
  `make db-snapshot`.
- `apps/api/prisma/migrations/` — Prisma migration files. `000000000000_baseline`
  was generated from the existing database; subsequent changes use
  `make db-migrate-dev`.
- `apps/api/prisma/seed.ts` — idempotent demo seed using Prisma Client.
- `apps/api/prisma/reset.ts` — drops `public`, reapplies migrations, and seeds.

## Schema workflow

1. Make sure Postgres is running (`make postgres-up`) and the database is up to
   date.
2. To capture the current database structure as a snapshot:
   ```sh
   make db-pull        # alias: make db-snapshot
   ```
3. After schema changes, generate the client:
   ```sh
   make db-generate
   ```
4. To create a migration from schema changes:
   ```sh
   make db-migrate-dev
   ```
5. To apply pending migrations:
   ```sh
   make db-migrate
   ```

**Rule: every schema change must ship its snapshot.** If you create or modify a
migration, you must run `make db-pull` afterwards so `schema.prisma` reflects
the latest database state, then run `make db-generate`. Commit both the
migration directory and the updated `schema.prisma` together. Never edit
`schema.prisma` by hand.

## Makefile commands

| Target | Purpose |
|--------|---------|
| `make db-generate` | Generate Prisma Client from `schema.prisma` |
| `make db-pull` / `make db-snapshot` | Introspect DB and rewrite `schema.prisma` |
| `make db-push` | Push schema changes to DB (development only) |
| `make db-migrate` | Apply pending Prisma migrations |
| `make db-migrate-dev` | Create a new migration from schema changes |
| `make db-seed` | Run `prisma/seed.ts` |
| `make db-reset` | Drop `public`, migrate, and seed |
| `make db-init` | Run migrations + seed |
| `make db-studio` | Open Prisma Studio |

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
  `currency`, `when_label`, `created_at`. `currency` preserves the selected ISO
  code for display and future FX support.
- `expense_participants` — `expense_id`, `member_id` (unique together).
- `user_preferences` — `user_id` (PK, references `user`), `planner_sidebar_width`,
  `planner_sidebar_collapsed`, `updated_at`. Stores UI chrome such as the
  travel-planner resizable sidebar width and collapsed state.

Amounts are stored as integers in their selected currency. The current budget
algorithm does not convert FX; mixed-currency expenses are persisted/displayed
with their own currency, while aggregate budget math still sums numeric amounts.
`lat`/`lng` are `double precision`.

## Legacy SQL migrations

The files in `apps/api/migrations/` (0001–0008) applied the schema before
Prisma was introduced. They are kept for historical reference. The baseline
Prisma migration in `apps/api/prisma/migrations/000000000000_baseline/` was
generated from the live database with `prisma migrate diff` and produces the
same final schema.

## Better Auth tables

Created by the baseline migration so the same schema applies to Docker Postgres
and Hyperdrive-fronted Postgres. If Better Auth options change, regenerate the
schema with the Better Auth CLI, pull it into `schema.prisma`, and create a new
Prisma migration — do not edit applied migration files. The `user` table also
carries a `defaultCurrency` column (a Better Auth `additionalField`) surfaced on
every session. See [auth.md](auth.md).
