# Cloudflare deployment

Pages (frontend) + Workers (API) + Hyperdrive (external PostgreSQL). Config
lives in [deploy/cloudflare](../../deploy/cloudflare/README.md). Reference:
[../reference/deployment-sources.md](../reference/deployment-sources.md).

## Production hostnames

| Surface | URL |
| --- | --- |
| Web | https://opentrip.im |
| API | https://api.opentrip.im |

The SPA bakes `BASE_URL=https://api.opentrip.im` at build time. The Worker
uses the same origin for Better Auth and sets `TRUSTED_ORIGINS` to the Pages
origins (`https://opentrip.im`, `https://www.opentrip.im`).

## Continuous deployment (git push)

Pushing to `main` triggers
[`.github/workflows/deploy-cloudflare.yml`](../../.github/workflows/deploy-cloudflare.yml):

1. Build and deploy the SPA to Pages project `opentrip-web` (custom domain
   `opentrip.im`).
2. If `deploy/cloudflare/wrangler.api.jsonc` has a real Hyperdrive id, deploy
   the API Worker (`opentrip-api`, custom domain `api.opentrip.im`) and sync
   GitHub secrets into Worker secrets.

### GitHub secrets

| Secret | Required | Notes |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | yes | Workers + Pages + DNS + Hyperdrive + R2 |
| `CLOUDFLARE_ACCOUNT_ID` | yes | Account id |
| `BETTER_AUTH_SECRET` | for API | ≥ 32 chars |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | for API | R2 S3 API credentials |
| `AI_API_KEY` | optional | Enables trip agent with `AI_MODEL` var |
| `OPENWEATHERMAP_API_KEY` | optional | Weather proxy |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google sign-in |
| `GOOGLE_MAPS_API_KEY` | optional | When `GEO_PROVIDER=google` |
| `CAPTCHA_SECRET_KEY` | optional | When captcha var is enabled |

Manual re-run: **Actions → Deploy Cloudflare → Run workflow**.

## Prerequisites

- `wrangler` v4+ (`npx wrangler` is fine).
- An external PostgreSQL reachable from Cloudflare (for Hyperdrive).
- Cloudflare zone for `opentrip.im` (already active on the deploy account).

## 1. Database connection (Worker)

### A. Hyperdrive (recommended — PlanetScale Postgres)

1. Create Hyperdrive in the Cloudflare dashboard against your Postgres origin.
2. Store **only** the config id as GitHub secret `HYPERDRIVE_ID` (never commit):

```bash
gh secret set HYPERDRIVE_ID -R stvlynn/OpenTrip
# paste the id when prompted
```

3. On deploy, `deploy-api.mjs` injects the binding from that env into a
   temporary wrangler config (not checked into git).

Committed Worker vars: `DATABASE_PROVIDER=postgres`.

For migrations, also keep origin `DATABASE_URL` (PlanetScale connection string)
as a GitHub secret and run `DB_INIT_ON_START` / `init_db` once.

### B. Direct `DATABASE_URL` (fallback)

If `HYPERDRIVE_ID` is unset, the Worker uses secret `DATABASE_URL` instead.
Set `DATABASE_PROVIDER` / `DATABASE_SSL` for MySQL direct connect as needed.

Worker prefers Hyperdrive when the binding is present.

## 2. Migrate + seed / one-shot deploy init

### Migrations on every deploy (best practice)

CI always runs **before** Worker deploy:

```text
prisma migrate deploy   # uses GitHub secret DATABASE_URL (origin)
→ wrangler deploy       # Worker uses Hyperdrive at runtime
```

| Secret | Role |
| --- | --- |
| `HYPERDRIVE_ID` | Inject Hyperdrive binding for the Worker |
| `DATABASE_URL` | Origin Postgres URL **only for CI migrate/seed** |

`prisma migrate deploy` is idempotent: if there are no new migration folders,
it is a no-op. New schema changes: write a migration in a PR
(`make db-migrate-dev` locally against a dev DB), merge to `main`, CI applies
it to production automatically.

Optional:

- Workflow input **skip_migrate** — emergency skip
- Variable `SKIP_DB_MIGRATE=true` — disable migrate until removed
- Workflow input **seed_db** / variable `DB_INIT_SEED=true` — demo seed (rare in prod)

### Manual migrate + seed (local / break-glass)

```bash
# Postgres (same as CI)
DATABASE_URL="postgres://…" pnpm db:migrate
DATABASE_URL="postgres://…" pnpm db:seed

# MySQL (legacy / alternate)
DATABASE_PROVIDER=mysql DATABASE_URL="mysql://…" \
  pnpm --filter @opentrip/api db:mysql-init
```

## 3. API (Workers)

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=<CLOUDFLARE_ACCOUNT_ID>

# One-time or when secrets change (also runs in CI after API deploy):
node deploy/cloudflare/scripts/sync-secrets.mjs

node deploy/cloudflare/scripts/deploy-api.mjs
```

`wrangler.api.jsonc` sets `compatibility_flags: ["nodejs_compat_v2"]`, the
`HYPERDRIVE` binding, `observability.enabled`, custom domain `api.opentrip.im`,
and non-secret vars (including R2 endpoint/bucket and agent model settings).

## 4. Frontend (Pages)

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=<CLOUDFLARE_ACCOUNT_ID>

node deploy/cloudflare/scripts/deploy-web.mjs
```

Equivalent low-level commands:

```bash
BASE_URL="https://api.opentrip.im" pnpm --filter @opentrip/web build
npx wrangler pages deploy apps/web/dist --project-name opentrip-web
```

See [deploy/cloudflare/pages.md](../../deploy/cloudflare/pages.md).

## Secrets

Only key names are committed, in
[deploy/cloudflare/secrets.example.json](../../deploy/cloudflare/secrets.example.json).
Prefer `node deploy/cloudflare/scripts/sync-secrets.mjs` (reads
`.secrets.local.json`, root `.env` non-local values, or `--from-env`).
Alternatively `wrangler secret put <KEY> --config deploy/cloudflare/wrangler.api.jsonc`.

Set `BASE_URL` (Worker origin), `TRUSTED_ORIGINS` (Pages origins), and the
non-secret S3-compatible R2 configuration as vars. The Worker does not use a
native filesystem or R2 binding; all object storage configuration is supplied
through env values.

To enable the trip agent (see [../backend/agent.md](../backend/agent.md)), set
`AI_API_KEY` as a secret and `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, and the
threshold vars (`AI_PROACTIVE_THRESHOLD`, `AI_MAX_TOOL_STEPS`) as vars. Without
`AI_MODEL` + `AI_API_KEY` the agent routes respond 404 and the frontend hides
the entry point.

Geo agent tools default to OSM (`GEO_PROVIDER=osm`). To use Google Places +
Routes instead, set `GEO_PROVIDER=google` as a var and
`GOOGLE_MAPS_API_KEY` as a secret. Optional OSM endpoint overrides
(`GEO_OSM_NOMINATIM_URL`, `GEO_OSM_OVERPASS_URL`, `GEO_OSM_OSRM_URL`,
`GEO_OSM_USER_AGENT`) are vars. See [../backend/geo.md](../backend/geo.md).

## Troubleshooting

### Browser shows “blocked by CORS” on `api.opentrip.im`

CORS is configured from `TRUSTED_ORIGINS` and is correct for
`https://opentrip.im`. When the Worker **hangs or throws before a response**
(Cloudflare error **1101**), the edge returns a plain error page **without**
CORS headers — Chrome reports that as a CORS failure.

Check Workers Logs for:

- `Worker's code had hung and would never generate a response`
- `$workers.outcome = exception` on `/api/auth/*`

Mitigations in code: shared `pg.Pool` for domain + Better Auth, connection
timeouts, no session preload on `/api/auth/*`, and emergency CORS on uncaught
Worker errors. Prefer Hyperdrive over a raw origin `DATABASE_URL` on the Worker.

## Rollback

```bash
npx wrangler rollback --config deploy/cloudflare/wrangler.api.jsonc
```

Pages: redeploy a previous build, or promote a prior deployment in the
dashboard.
