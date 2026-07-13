# Cloudflare deployment

Frontend on **Pages**, API on **Workers**, PostgreSQL fronted by **Hyperdrive**.
Full walkthrough: [../../docs/operations/cloudflare.md](../../docs/operations/cloudflare.md).

## Production URLs

| Surface | Hostname |
| --- | --- |
| Web (Pages) | https://opentrip.im · https://www.opentrip.im · https://opentrip-web.pages.dev |
| API (Worker) | https://api.opentrip.im · https://opentrip-api.stvlynn.workers.dev |

## Files

| Path | Purpose |
| --- | --- |
| [wrangler.api.jsonc](wrangler.api.jsonc) | Workers config (routes, fallback vars) |
| [secrets.example.json](secrets.example.json) | Secret key names only (no values) |
| [vars.example.json](vars.example.json) | Non-secret Actions variable key names |
| [scripts/deploy-web.mjs](scripts/deploy-web.mjs) | Build SPA + `wrangler pages deploy` |
| [scripts/deploy-api.mjs](scripts/deploy-api.mjs) | Deploy API Worker; overlay Actions vars |
| [scripts/sync-secrets.mjs](scripts/sync-secrets.mjs) | Bulk-upload Worker secrets |
| [scripts/set-hyperdrive.mjs](scripts/set-hyperdrive.mjs) | Patch Hyperdrive id into wrangler config |
| [hyperdrive.md](hyperdrive.md) | Create/configure Hyperdrive |
| [pages.md](pages.md) | Pages build notes |

## Git push auto-deploy

Pushing to `main` runs [`.github/workflows/deploy-cloudflare.yml`](../../.github/workflows/deploy-cloudflare.yml):

1. **Pages** deploys with `API_BASE_URL`, `CAPTCHA_PROVIDER`, `TURNSTILE_SITE_KEY`.
2. **API Worker** deploys with Hyperdrive id + Actions **variables** overlaid
   onto wrangler vars.
3. GitHub **secrets** are bulk-synced to the Worker.

Production config lives in **GitHub Actions secrets/variables**, not in git.

### Required GitHub secrets

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Wrangler auth (Workers Scripts Write, Pages Write, DNS Write, Account Read, Hyperdrive, R2) |
| `CLOUDFLARE_ACCOUNT_ID` | Account id |
| `HYPERDRIVE_ID` | Hyperdrive config id (deploy inject, cached) |
| `HYPERDRIVE_CACHE_DISABLED_ID` | Cache-disabled Hyperdrive for consistency-critical repositories |
| `DATABASE_URL` | Origin DB URL for CI migrate only |
| `BETTER_AUTH_SECRET` | Auth signing secret |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2 credentials |

### Auth / captcha / email secrets

| Secret | Purpose |
| --- | --- |
| `TURNSTILE_SITE_KEY` | Public Turnstile site key (SPA build) |
| `CAPTCHA_SECRET_KEY` | Turnstile secret (Worker) |
| `RESEND_API_KEY` | OTP mail when `EMAIL_PROVIDER=resend` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |

### Optional secrets

`AI_API_KEY`, `OPENWEATHERMAP_API_KEY`, `GOOGLE_MAPS_API_KEY`,
`UNSPLASH_ACCESS_KEY` (trip cover on create; without it cards keep the SVG
placeholder).

```bash
gh secret set RESEND_API_KEY -R stvlynn/OpenTrip
gh secret set UNSPLASH_ACCESS_KEY -R stvlynn/OpenTrip
gh variable set EMAIL_PROVIDER --body "resend" -R stvlynn/OpenTrip
```

### Required GitHub variables

See [vars.example.json](vars.example.json). At minimum for auth:

| Variable | Example |
| --- | --- |
| `API_BASE_URL` | `https://api.opentrip.im` |
| `TRUSTED_ORIGINS` | Pages origins + `opentrip://` |
| `CAPTCHA_PROVIDER` | `cloudflare-turnstile` |
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_FROM` | `OpenTrip <noreply@opentrip.im>` |

## One-time bootstrap

### 1. Database: Hyperdrive (Postgres / PlanetScale)

**Do not commit** the Hyperdrive ids. Store them as GitHub secrets:

```bash
gh secret set HYPERDRIVE_ID -R stvlynn/OpenTrip
# paste the cached config id

gh secret set HYPERDRIVE_CACHE_DISABLED_ID -R stvlynn/OpenTrip
# paste the --caching-disabled config id (same origin DB)
```

CI passes both into `deploy-api.mjs`, which injects `HYPERDRIVE` and
`HYPERDRIVE_CACHE_DISABLED` at deploy time into a temporary wrangler file.
See [hyperdrive.md](hyperdrive.md).

Optional: keep origin `DATABASE_URL` as a GitHub secret for `db:migrate` only
(Worker runtime uses Hyperdrive, not this secret).

### 1b. Fallback: direct `DATABASE_URL` secret

If you omit `HYPERDRIVE_ID`, set Worker secret `DATABASE_URL` instead
(`wrangler secret put` or include it in sync — CI intentionally skips syncing
`DATABASE_URL` when Hyperdrive is used).

### Seed on demand

**Run workflow** → enable **seed_db**, or set variable `DB_INIT_SEED=true`
temporarily.

Local equivalent (Postgres origin URL, not Hyperdrive):

```bash
DATABASE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" pnpm db:migrate
DATABASE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" pnpm db:seed
```

### 2. Local secret file (optional, gitignored)

Copy real values into `deploy/cloudflare/.secrets.local.json` (same shape as
`secrets.example.json`). Or rely on GitHub secrets only.

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=<CLOUDFLARE_ACCOUNT_ID>

# After Hyperdrive is set and the Worker exists:
node deploy/cloudflare/scripts/sync-secrets.mjs
```

### 3. Manual deploy

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=<CLOUDFLARE_ACCOUNT_ID>

# Match production Actions vars when testing locally:
export API_BASE_URL=https://api.opentrip.im
export CAPTCHA_PROVIDER=cloudflare-turnstile
export TURNSTILE_SITE_KEY=…
export EMAIL_PROVIDER=resend
export EMAIL_FROM='OpenTrip <noreply@opentrip.im>'

node deploy/cloudflare/scripts/deploy-web.mjs
node deploy/cloudflare/scripts/deploy-api.mjs
node deploy/cloudflare/scripts/sync-secrets.mjs
```

## Vars vs secrets

- **Variables** (non-secret) — GitHub Actions variables; overlaid by
  `deploy-api.mjs` / baked by `deploy-web.mjs`. Key list:
  [vars.example.json](vars.example.json).
- **Secrets** — never committed. GitHub secrets → `sync-secrets.mjs` /
  `wrangler secret put`. Key list: [secrets.example.json](secrets.example.json).

`wrangler.api.jsonc` `vars` remain as **local defaults** only.

The committed Worker config owns the `TRIP_REALTIME` and `AUTH_RATE_LIMIT`
Durable Object bindings. Authentication limits use the latter for globally
atomic enforcement; do not add KV, database, or PoP-local rate-limit bindings
as alternate auth paths.

## R2

Configure the R2 bucket **only** via GitHub Actions variables/secrets (not in
git):

| Actions | Key | Notes |
| --- | --- | --- |
| Variable | `STORAGE_BACKEND` | `s3` |
| Variable | `S3_BUCKET` | R2 bucket name (e.g. set with `gh variable set`) |
| Variable | `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| Variable | `S3_REGION` | `auto` |
| Secret | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2 S3 API token |

`deploy-api.mjs` overlays these at deploy time and refuses to deploy
`STORAGE_BACKEND=s3` without `S3_BUCKET` + `S3_ENDPOINT` from env.

## Rollback

```bash
npx wrangler rollback --config deploy/cloudflare/wrangler.api.jsonc
```

Pages: redeploy a previous build, or promote a prior deployment in the dashboard.
