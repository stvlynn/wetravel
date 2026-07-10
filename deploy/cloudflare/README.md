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
| [wrangler.api.jsonc](wrangler.api.jsonc) | Workers config (routes, Hyperdrive, vars) |
| [secrets.example.json](secrets.example.json) | Secret key names only (no values) |
| [scripts/deploy-web.mjs](scripts/deploy-web.mjs) | Build SPA + `wrangler pages deploy` |
| [scripts/deploy-api.mjs](scripts/deploy-api.mjs) | Deploy API Worker (requires Hyperdrive) |
| [scripts/sync-secrets.mjs](scripts/sync-secrets.mjs) | Bulk-upload Worker secrets |
| [scripts/set-hyperdrive.mjs](scripts/set-hyperdrive.mjs) | Patch Hyperdrive id into wrangler config |
| [hyperdrive.md](hyperdrive.md) | Create/configure Hyperdrive |
| [pages.md](pages.md) | Pages build notes |

## Git push auto-deploy

Pushing to `main` runs [`.github/workflows/deploy-cloudflare.yml`](../../.github/workflows/deploy-cloudflare.yml):

1. **Pages** always deploys (`opentrip-web` → `opentrip.im`).
2. **API Worker** deploys only when `wrangler.api.jsonc` has a real Hyperdrive id (not the placeholder).
3. When API deploys, GitHub secrets whose names match Worker secret keys are bulk-synced.

### Required GitHub secrets

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Wrangler auth (Workers Scripts Write, Pages Write, DNS Write, Account Read, Hyperdrive, R2) |
| `CLOUDFLARE_ACCOUNT_ID` | `<CLOUDFLARE_ACCOUNT_ID>` |

### Optional GitHub secrets (synced to the Worker)

`BETTER_AUTH_SECRET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AI_API_KEY`,
`OPENWEATHERMAP_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_MAPS_API_KEY`, `CAPTCHA_SECRET_KEY`.

```bash
# Example: update one secret and re-sync on next deploy
gh secret set AI_API_KEY -R stvlynn/OpenTrip
```

## One-time bootstrap

### 1. Database: direct MySQL secret (default)

When Hyperdrive cannot complete TLS to your managed MySQL, use a **Worker
secret** instead of a Hyperdrive binding.

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=<CLOUDFLARE_ACCOUNT_ID>

# Never commit this value. Load from a private shell / password manager.
echo -n "$DATABASE_URL" | npx wrangler secret put DATABASE_URL \
  --config deploy/cloudflare/wrangler.api.jsonc
```

Vars already in `wrangler.api.jsonc`:

- `DATABASE_PROVIDER=mysql`
- `DATABASE_SSL=off` — plain TCP (use `required` only if the origin supports TLS)

Or set GitHub repo secret `DATABASE_URL`; CI syncs it on each API deploy.

### One-shot DB init on deploy

If the database does not exist yet:

1. GitHub → **Settings → Secrets and variables → Actions → Variables**
2. Add `DB_INIT_ON_START` = `true` (optional: `DB_INIT_SEED` = `true`)
3. Push or re-run **Deploy Cloudflare**
4. After success, set `DB_INIT_ON_START` = `false` so later deploys skip init

Alternatively: **Run workflow** → enable **init_db** once (no variable needed).

Local equivalent:

```bash
DATABASE_PROVIDER=mysql DATABASE_URL="$DATABASE_URL" DATABASE_SSL=off \
  pnpm --filter @opentrip/api db:mysql-init
```

### 1b. Optional Hyperdrive

If the origin works with Hyperdrive, bind it and omit `DATABASE_URL` (Worker
prefers Hyperdrive when present). See [hyperdrive.md](hyperdrive.md).

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

node deploy/cloudflare/scripts/deploy-web.mjs
node deploy/cloudflare/scripts/deploy-api.mjs
node deploy/cloudflare/scripts/sync-secrets.mjs
```

## Vars vs secrets

- **Vars** (non-secret) live in `wrangler.api.jsonc` → `vars`.
  Production defaults: `BASE_URL=https://api.opentrip.im`,
  `TRUSTED_ORIGINS` includes `https://opentrip.im`, R2 endpoint/bucket,
  agent model settings.
- **Secrets** are never committed. Set with `sync-secrets.mjs` or
  `wrangler secret put <KEY> --config deploy/cloudflare/wrangler.api.jsonc`.

## R2

Bucket `opentrip-uploads` holds avatars/media via the S3-compatible API
(`STORAGE_BACKEND=s3`). Access key id + secret access key are Worker secrets.

## Rollback

```bash
npx wrangler rollback --config deploy/cloudflare/wrangler.api.jsonc
```

Pages: redeploy a previous build, or promote a prior deployment in the dashboard.
