# Cloudflare deployment

Pages (frontend) + Workers (API) + Hyperdrive (external PostgreSQL). Config
lives in [deploy/cloudflare](../../deploy/cloudflare/README.md). Reference:
[../reference/deployment-sources.md](../reference/deployment-sources.md).

## Production hostnames

| Surface | URL |
| --- | --- |
| Web | https://opentrip.im |
| API | https://api.opentrip.im |

The SPA bakes `API_BASE_URL` (as Vite `BASE_URL`) at build time. The Worker
uses the same origin for Better Auth. `TRUSTED_ORIGINS` lists the Pages
origins plus `opentrip://` for native.

## Continuous deployment (git push)

Pushing to `main` triggers
[`.github/workflows/deploy-cloudflare.yml`](../../.github/workflows/deploy-cloudflare.yml):

1. Build and deploy the SPA to Pages (`opentrip-web` → `opentrip.im`), baking
   `CAPTCHA_PROVIDER` + `TURNSTILE_SITE_KEY` when set.
2. Deploy the API Worker (`opentrip-api` → `api.opentrip.im`), overlaying
   GitHub Actions **variables** onto `wrangler.api.jsonc` vars.
3. Sync GitHub **secrets** into Worker secrets (`sync-secrets.mjs`).

**Source of truth for production config is GitHub Actions** (Settings →
Secrets and variables → Actions). Committed `wrangler.api.jsonc` vars are
local/manual defaults only.

### GitHub secrets

| Secret | Required | Notes |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | yes | Workers + Pages + DNS + Hyperdrive + R2 |
| `CLOUDFLARE_ACCOUNT_ID` | yes | Account id |
| `HYPERDRIVE_ID` | for API | Cached Hyperdrive id (deploy inject; never commit) |
| `HYPERDRIVE_CACHE_DISABLED_ID` | for API | Cache-disabled Hyperdrive for consistency-critical repositories |
| `DATABASE_URL` | for migrate | Origin Postgres URL (CI only, not Worker runtime) |
| `BETTER_AUTH_SECRET` | for API | ≥ 32 chars |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | for API | R2 S3 API credentials |
| `TURNSTILE_SITE_KEY` | captcha | Public site key baked into the SPA |
| `CAPTCHA_SECRET_KEY` | captcha | Worker-only; pair with var `CAPTCHA_PROVIDER` |
| `RESEND_API_KEY` | email OTP | Required when var `EMAIL_PROVIDER=resend` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google sign-in |
| `AI_API_KEY` | optional | Trip agent |
| `OPENWEATHERMAP_API_KEY` | optional | Weather proxy |
| `GOOGLE_MAPS_API_KEY` | optional | When `GEO_PROVIDER=google` |
| `UNSPLASH_ACCESS_KEY` | optional | Trip cover on create; omit → SVG placeholder |

### GitHub variables

See [deploy/cloudflare/vars.example.json](../../deploy/cloudflare/vars.example.json)
for the full list. Production must set at least:

| Variable | Example |
| --- | --- |
| `API_BASE_URL` | `https://api.opentrip.im` |
| `TRUSTED_ORIGINS` | `https://opentrip.im,…,opentrip://` |
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_FROM` | `OpenTrip <noreply@opentrip.im>` |
| `CAPTCHA_PROVIDER` | `cloudflare-turnstile` |
| `DATABASE_PROVIDER` | `postgres` |
| `STORAGE_BACKEND` / `S3_*` | Set in Actions only (R2 bucket/endpoint) |
| `AI_*` / `GEO_*` | Agent and geo |

Manual re-run: **Actions → Deploy Cloudflare → Run workflow**.

## Prerequisites

- `wrangler` v4+ (`npx wrangler` is fine).
- An external PostgreSQL reachable from Cloudflare (for Hyperdrive).
- Cloudflare zone for `opentrip.im` (already active on the deploy account).

## 1. Database connection (Worker)

### A. Hyperdrive (recommended — PlanetScale Postgres)

1. Create **two** Hyperdrive configs against the same Postgres origin:
   - `opentrip-db` — query caching enabled, reserved for explicitly
     stale-tolerant read models.
   - `opentrip-db-fresh` — `--caching-disabled` (Trip/member state,
     authorization, invites, preferences, auth, and agent sessions).
2. Store the ids as GitHub secrets (never commit):

```bash
gh secret set HYPERDRIVE_ID -R stvlynn/OpenTrip
gh secret set HYPERDRIVE_CACHE_DISABLED_ID -R stvlynn/OpenTrip
```

3. On deploy, `deploy-api.mjs` injects both bindings from those env vars into a
   temporary wrangler config (not checked into git).

Committed fallback in `wrangler.api.jsonc`: `DATABASE_PROVIDER=postgres`
(overridden by Actions var when set).

For migrations, also keep origin `DATABASE_URL` (PlanetScale connection string)
as a GitHub secret; CI runs `prisma migrate deploy` before Worker deploy.

### B. Direct `DATABASE_URL` (fallback)

If `HYPERDRIVE_ID` is unset, the Worker uses secret `DATABASE_URL` instead.
Set `DATABASE_PROVIDER` / `DATABASE_SSL` for MySQL direct connect as needed.

Worker prefers Hyperdrive when the binding is present.

When the cached Hyperdrive binding is present, the Worker requires the fresh
binding and returns 503 if it is missing. It never silently routes
consistency-critical repositories through the cached binding. Cache-disabled
Hyperdrive still provides managed connection pooling; only query-result caching
is disabled.

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
| `HYPERDRIVE_CACHE_DISABLED_ID` | Inject cache-disabled Hyperdrive for auth/agent |
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

# Optional: overlay the same vars CI uses
export API_BASE_URL=https://api.opentrip.im
export EMAIL_PROVIDER=resend
export CAPTCHA_PROVIDER=cloudflare-turnstile
# …

node deploy/cloudflare/scripts/deploy-api.mjs
```

`wrangler.api.jsonc` sets `compatibility_flags: ["nodejs_compat"]`,
observability, custom domain `api.opentrip.im`, and **fallback** non-secret
vars. Production values come from GitHub Actions variables via
`deploy-api.mjs`.

## 4. Frontend (Pages)

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=<CLOUDFLARE_ACCOUNT_ID>
export API_BASE_URL=https://api.opentrip.im
export CAPTCHA_PROVIDER=cloudflare-turnstile
export TURNSTILE_SITE_KEY=…   # public site key

node deploy/cloudflare/scripts/deploy-web.mjs
```

See [deploy/cloudflare/pages.md](../../deploy/cloudflare/pages.md). The build
ships `_redirects` (SPA fallback) and `_headers` (service worker + manifest
`no-cache`, immutable hashed assets) from `apps/web/public/`.

## Secrets and variables

- **Secrets** — key names in
  [deploy/cloudflare/secrets.example.json](../../deploy/cloudflare/secrets.example.json).
  Prefer GitHub secrets + CI sync; locally `sync-secrets.mjs` or
  `wrangler secret put`.
- **Variables** — key names in
  [deploy/cloudflare/vars.example.json](../../deploy/cloudflare/vars.example.json).
  Prefer GitHub Actions variables; `deploy-api.mjs` overlays them at deploy.

Captcha: public `TURNSTILE_SITE_KEY` (secret in GitHub only so it is not
committed; still safe to bake into the SPA) + Worker `CAPTCHA_SECRET_KEY`.
Email OTP: `EMAIL_PROVIDER=resend` + `EMAIL_FROM` + `RESEND_API_KEY`.

To enable the trip agent (see [../backend/agent.md](../backend/agent.md)), set
`AI_API_KEY` as a secret and `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, and the
threshold vars as Actions variables. Without `AI_MODEL` + `AI_API_KEY` the
agent routes respond 404 and the frontend hides the entry point.

Geo agent tools default to OSM (`GEO_PROVIDER=osm`). To use Google Places +
Routes instead, set `GEO_PROVIDER=google` and `GOOGLE_MAPS_API_KEY`. See
[../backend/geo.md](../backend/geo.md).

Airbnb lodging tools (`airbnbSearch`, `airbnbListingDetails`) need no API key.
Optional vars: `LODGING_IGNORE_ROBOTS_TXT`, `LODGING_DISABLE_GEOCODING`,
`LODGING_TIMEOUT_MS`, `LODGING_GEOCODE_USER_AGENT`. See
[../backend/lodging.md](../backend/lodging.md).

## Troubleshooting

### Browser shows “blocked by CORS” on `api.opentrip.im`

CORS is configured from `TRUSTED_ORIGINS` and is correct for
`https://opentrip.im`. When the Worker **hangs or throws before a response**
(Cloudflare error **1101**), the edge returns a plain error page **without**
CORS headers — Chrome reports that as a CORS failure.

Check Workers Logs for:

- `Worker's code had hung and would never generate a response`
- `$workers.outcome = exception` on `/api/auth/*`

Mitigations in code: **per-request** shared `pg.Pool` (do not cache across
Worker isolate freezes), connection timeouts, no session preload on
`/api/auth/*`, and emergency CORS on uncaught Worker errors. Hyperdrive still
pools origin TCP at the edge.

### Sign-up shows no captcha / no OTP step

1. Confirm Actions vars `CAPTCHA_PROVIDER` and secrets `TURNSTILE_SITE_KEY` /
   `CAPTCHA_SECRET_KEY` are set, and the latest Pages + Worker deploy ran.
2. Confirm `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, and `RESEND_API_KEY`.
3. OTP UI lives in `AuthForm` after a successful `sign-up/email`. Gate must not
   remount on session refetch while logged out (initial `isPending` only).

## Hyperdrive read-after-write

Hyperdrive **caches eligible `SELECT` responses** (default `max_age` 60s) and
**does not invalidate** that cache when the Worker writes to the origin. A
matching `SELECT` right after an `INSERT`/`UPDATE` can therefore return a
stale row until `max_age` expires (or during `stale_while_revalidate`).

**Local Docker does not use Hyperdrive** — write-then-refetch bugs often pass
`make dev` and only show on `opentrip.im` (or any Worker + Hyperdrive deploy).

SPA conventions and checklists:
[../frontend/data-caching.md](../frontend/data-caching.md).
ADR: [../decisions/0006-mutation-echo-over-refetch.md](../decisions/0006-mutation-echo-over-refetch.md).

### Application rules

1. **Mutation responses must not re-`SELECT` the row just written.** Repository
   update methods return the written domain snapshot (e.g.
   `SqlUserPreferenceRepository.updateAgentPanel`). Echoing a post-write
   `findByUserId` into the HTTP body caused the agent panel to snap shut after
   open: optimistic `collapsed: false` was overwritten by a cached `true`.
   Agent `POST …/messages` returns the inserted `message` DTO so the SPA can
   `setQueryData` without an immediate list GET.
2. **Classify reads by consistency.** Business state and authorization use the
   cache-disabled binding; query caching is reserved for a separately named,
   stale-tolerant read model.
3. **Use the cache-disabled Hyperdrive binding** (`HYPERDRIVE_CACHE_DISABLED`)
   for Trip/member state, permissions, invites, preferences, Better Auth, and
   agent sessions. The Worker refuses a cached-only Hyperdrive deployment
   rather than silently weakening consistency.
4. **Trip create** follows the same echo pattern: `POST /api/trips` returns the
   full `TripDto`; the SPA `setQueryData`s the list + detail caches and opens
   the planner instead of refetching `GET /api/trips`.

### Anti-patterns (will bite in prod)

| Anti-pattern | What happens |
| --- | --- |
| `useMutation({ onSuccess: () => invalidateQueries(trips) })` after create | Stale `GET /api/trips` overwrites cache; new trip missing ~60s |
| `invalidateQueries(trip)` after agent stream settle or agent events poll | Stale `GET /api/trips/:id` wipes a just-echoed stop insert (prod only) |
| Repository `update` then `findById` for the HTTP body | Client receives pre-write values from SELECT cache |
| Agent `patchQueue` calling `findById` / `loadEditable` between each write tool | Later tool echoes carry sibling days/stops from a stale SELECT; SPA last-wins looks like Day 1 “rolled back” |
| “Fix” by turning off Hyperdrive query cache | Higher origin load; hides the real contract bug |
| QA only on `make dev` for create → list flows | False confidence; Hyperdrive never in the path |

### How to verify a suspected stale list

1. Network: `POST` returns `201` with the new `id`.
2. Immediate `GET /api/trips` omits that `id` (or returns old fields).
3. Direct `GET /api/trips/:id` is `200` (row exists; list/cache path is wrong).
4. Same flow on local Docker shows the new row immediately.

Cloudflare reference:
[Query caching — read-after-write](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/#read-after-write-behavior).

See [deploy/cloudflare/hyperdrive.md](../../deploy/cloudflare/hyperdrive.md) for
create/bind steps.

## Rollback

```bash
npx wrangler rollback --config deploy/cloudflare/wrangler.api.jsonc
```

Pages: redeploy a previous build, or promote a prior deployment in the
dashboard.
