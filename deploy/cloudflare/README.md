# Cloudflare deployment

Frontend on **Pages**, API on **Workers**, PostgreSQL fronted by **Hyperdrive**.
Full walkthrough: [../../docs/operations/cloudflare.md](../../docs/operations/cloudflare.md).

## Files

- [wrangler.api.jsonc](wrangler.api.jsonc) — Workers config for the API
  (`nodejs_compat_v2`, `HYPERDRIVE` binding, observability, vars).
- [secrets.example.json](secrets.example.json) — secret key names (no values).
- [hyperdrive.md](hyperdrive.md) — create/configure the Hyperdrive binding.
- [pages.md](pages.md) — build and deploy the SPA to Pages.

## Quick start

```bash
# 1. Hyperdrive over your external Postgres
wrangler hyperdrive create wetravel-db \
  --connection-string "postgres://USER:PASSWORD@HOST:5432/DBNAME"
# paste the id into wrangler.api.jsonc

# 2. Schema + seed (from a host that can reach the DB)
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME" pnpm db:migrate
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME" pnpm db:seed

# 3. API (Workers)
cd deploy/cloudflare
wrangler secret put BETTER_AUTH_SECRET --config wrangler.api.jsonc
wrangler deploy --config wrangler.api.jsonc

# 4. Frontend (Pages)
BASE_URL="https://<api-worker-domain>" pnpm --filter @wetravel/web build
wrangler pages deploy apps/web/dist --project-name wetravel-web
```

Set `TRUSTED_ORIGINS` (var in `wrangler.api.jsonc`) to the Pages origin so auth
CSRF checks pass, and `BASE_URL` to the Worker's public URL.
