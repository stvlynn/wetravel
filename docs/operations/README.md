# Operations

## Local development

```bash
make setup             # first time: install + .env + Postgres + migrate + seed
make dev               # Postgres (if needed) + web + api
```

`make dev` ensures the root `.env` exists, starts Postgres via Docker when port
5432 is not already reachable, applies pending migrations, then runs both dev
servers in parallel:

- **web** — Vite on http://localhost:5173 (proxies `/api` to the API).
- **api** — Hono via `tsx watch` on http://localhost:8787 (loads root `.env`).

Other useful targets:

| Command | Purpose |
| --- | --- |
| `make dev-nodb` | Start web + api only (skip Postgres startup) |
| `make dev-web` | Vite only |
| `make dev-api` | Postgres + migrations + API only |
| `make postgres-up` / `make postgres-down` | Start/stop local Postgres container |
| `make db-init` | `db:migrate` + `db:seed` |
| `make db-reset` | drop all tables, then `db:migrate` + `db:seed` |
| `make deploy-up` | Full docker stack (postgres + api + web on :8080) |

`.env` is created from `.env.example` on first run. `BASE_URL` is the single
public origin used by the frontend API client and Better Auth (default:
`http://localhost:5173`). Ensure `DATABASE_URL` matches the Postgres credentials
(defaults: `wetravel:wetravel@localhost:5432/wetravel`).

## Local verification

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm docs:check
```

`make check` runs typecheck + lint + test + build. Dev servers are intentionally
not part of automated verification.

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `BASE_URL` | web + api | public API/auth origin used by browser and Better Auth |
| `DATABASE_URL` | api (Node/Docker) | Postgres connection string |
| `BETTER_AUTH_SECRET` | api | >= 32 chars |
| `TRUSTED_ORIGINS` | api | comma-separated web origins |
| `STORAGE_BACKEND` | api | required: `fs` on Node/Docker or `s3` for S3-compatible storage |
| `STORAGE_ROOT` | api | filesystem root or optional S3 object prefix |
| `STORAGE_PUBLIC_URL` | api | optional public base URL; defaults to `BASE_URL/api/uploads` |
| `S3_BUCKET` | api (`s3`) | bucket name |
| `S3_REGION` | api (`s3`) | region; use `auto` for Cloudflare R2 |
| `S3_ENDPOINT` | api (`s3`) | S3-compatible endpoint URL |
| `S3_ACCESS_KEY_ID` | api (`s3`) | secret access key id |
| `S3_SECRET_ACCESS_KEY` | api (`s3`) | secret access key |
| `S3_FORCE_PATH_STYLE` | api (`s3`) | optional `true`/`false`, default `false` |

On Cloudflare, `DATABASE_URL` is replaced by the Hyperdrive binding. Better Auth
and S3 credential values are set with `wrangler secret`.

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm db:migrate` | apply SQL migrations |
| `pnpm db:seed` | load prototype seed data |
| `pnpm db:reset` | drop all tables, then migrate + seed |
| `make help` | list Make targets |

## Deployment

- Cloudflare (Pages + Workers + Hyperdrive): [cloudflare.md](cloudflare.md).
- Docker Compose (postgres + api + web): [docker.md](docker.md).

## Logs and backup

- Cloudflare: Workers Logs (observability enabled in `wrangler.api.jsonc`),
  `wrangler tail` for live logs.
- Docker: `docker compose logs -f api`; Postgres backup via `pg_dump` (see
  [docker.md](docker.md)).
