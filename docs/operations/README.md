# Operations

## Local development

```bash
make setup             # first time: install + .env + Postgres + migrate + seed
make dev               # Postgres (if needed) + web + api
```

`make dev` ensures the root `.env` exists, starts Postgres via Docker when port
5430 is not already reachable, applies pending migrations, then runs both dev
servers in parallel:

- **web** — Vite on http://localhost:5170 (proxies `/api` to the API).
- **api** — Hono via `tsx watch` on http://localhost:8780 (loads root `.env`).

Other useful targets:

| Command | Purpose |
| --- | --- |
| `make dev-nodb` | Start web + api only (skip Postgres startup) |
| `make dev-web` | Vite only |
| `make dev-api` | Postgres + migrations + API only |
| `make miniapp` | Sync AppID, build weapp, open WeChat DevTools, then Taro watch |
| `make dev-miniapp` | Sync AppID + Taro weapp watch only |
| `make build-miniapp` | Sync AppID + one-shot weapp build |
| `make miniapp-open` | Sync AppID, clear DevTools project cache, and reopen `apps/miniapp` |
| `make miniapp-sync-appid` | Rewrite gitignored AppID private config from `apps/miniapp/.env` |
| `make miniapp-clear-cache` | Clear DevTools file/compile cache and rebuild its file watcher |
| `make dev-miniapp-api` | Postgres + API + Taro watch (no Vite) |
| `make postgres-up` / `make postgres-down` | Start/stop local Postgres container |
| `make db-init` | `db:migrate` + `db:seed` |
| `make db-reset` | drop all tables, then `db:migrate` + `db:seed` |
| `make deploy-up` | Full docker stack (postgres + api + web on :8090) |

WeChat Mini Program local debug details: [../frontend/miniapp.md](../frontend/miniapp.md).

`.env` is created from `.env.example` on first run. `BASE_URL` is the single
public origin used by the frontend API client and Better Auth (default:
`http://localhost:5170`). Ensure `DATABASE_URL` matches the Postgres credentials
(defaults: `opentrip:opentrip@localhost:5430/opentrip`).

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
| `DATABASE_PROVIDER` | api | `postgres` (default) or `mysql`; inferred from `DATABASE_URL` when omitted |
| `DATABASE_URL` | api (Node/Docker) | Postgres or MySQL connection string |
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
| `WECHAT_WEB_APP_ID` / `WECHAT_WEB_APP_SECRET` | api | optional WeChat Open Platform website QR login |
| `WECHAT_MINI_PROGRAM_APP_ID` / `WECHAT_MINI_PROGRAM_APP_SECRET` | api only | Mini Program login (`jscode2session`); never ship secret to the client |
| `TARO_APP_WECHAT_APP_ID` | `make miniapp*` | Mini Program AppID for WeChat DevTools; synced into gitignored `project.private.config.json` |
| `CLOUDFLARE_OBSERVABILITY_TOKEN` | local operator | historical Workers Logs query token; never synced to the Worker |

On Cloudflare, `DATABASE_URL` is replaced by the Hyperdrive binding; set Worker
var `DATABASE_PROVIDER` to `postgres` or `mysql` to match the origin database.
Better Auth and S3 credential values are set with `wrangler secret`.

## Common commands

| Command | Purpose |
| --- | --- |
| `pnpm db:migrate` | apply pending Prisma migrations |
| `pnpm db:seed` | load prototype seed data |
| `pnpm db:reset` | drop public schema, then migrate + seed |
| `pnpm db:generate` | regenerate Prisma Client after schema changes |
| `make help` | list Make targets |

## Deployment

- Cloudflare (Pages + Workers + Hyperdrive): [cloudflare.md](cloudflare.md).
  Production: **https://opentrip.im** (web) · **https://api.opentrip.im** (API).
  Pushing to `main` auto-deploys via GitHub Actions; see the Cloudflare doc for
  required repo secrets and the Hyperdrive bootstrap step. Read-after-write
  pitfalls (create trip missing from list, etc.):
  [cloudflare.md#hyperdrive-read-after-write](cloudflare.md#hyperdrive-read-after-write)
  and [../frontend/data-caching.md](../frontend/data-caching.md).
- Docker Compose (postgres + api + web): [docker.md](docker.md).

## Logs and backup

- Cloudflare: `pnpm logs:cf` for historical Workers Logs and
  `pnpm logs:cf -- --live` for Wrangler live logs.
- Docker: `docker compose logs -f api`; Postgres backup via `pg_dump` (see
  [docker.md](docker.md)).
- Agent/API trace correlation, Sentry queries, structured-log fields, and
  symptom runbooks: [observability.md](observability.md).
- Production incident notes and regression checks:
  [incidents/2026-07-14-workers-caching.md](incidents/2026-07-14-workers-caching.md).
