# Cloudflare deployment

Pages (frontend) + Workers (API) + Hyperdrive (external PostgreSQL). Config
lives in [deploy/cloudflare](../../deploy/cloudflare/README.md). Reference:
[../reference/deployment-sources.md](../reference/deployment-sources.md).

## Prerequisites

- `wrangler` v4+ (`pnpm add -D wrangler` or use `npx wrangler`).
- `wrangler login`.
- An external PostgreSQL reachable from Cloudflare.

## 1. Hyperdrive

```bash
wrangler hyperdrive create opentrip-db \
  --connection-string "postgres://USER:PASSWORD@HOST:5432/DBNAME"
```

Copy the returned id into `deploy/cloudflare/wrangler.api.jsonc` under the
`hyperdrive` binding (`binding: "HYPERDRIVE"`). Details:
[deploy/cloudflare/hyperdrive.md](../../deploy/cloudflare/hyperdrive.md).

## 2. Migrate + seed

Run migrations against the same database (from a machine that can reach it):

```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME" pnpm db:migrate
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME" pnpm db:seed
```

## 3. API (Workers)

```bash
cd deploy/cloudflare
wrangler secret put BETTER_AUTH_SECRET --config wrangler.api.jsonc
wrangler secret put S3_ACCESS_KEY_ID --config wrangler.api.jsonc
wrangler secret put S3_SECRET_ACCESS_KEY --config wrangler.api.jsonc
wrangler check --config wrangler.api.jsonc
wrangler types --config wrangler.api.jsonc
wrangler deploy --config wrangler.api.jsonc
```

`wrangler.api.jsonc` sets `compatibility_flags: ["nodejs_compat_v2"]`, the
`HYPERDRIVE` binding, `observability.enabled`, and non-secret vars. Replace the
placeholder R2 S3 endpoint and bucket before deployment. R2 uses region `auto`;
the access key id and secret are created under the bucket's S3 API tokens.

## 4. Frontend (Pages)

```bash
BASE_URL="https://<api-worker-domain>" pnpm --filter @opentrip/web build
wrangler pages deploy apps/web/dist --project-name opentrip-web
```

See [deploy/cloudflare/pages.md](../../deploy/cloudflare/pages.md).

## Secrets

Only key names are committed, in
[deploy/cloudflare/secrets.example.json](../../deploy/cloudflare/secrets.example.json).
Set real secret values with `wrangler secret put`. Set `BASE_URL` (Worker
origin), `TRUSTED_ORIGINS` (Pages origin), and the non-secret S3-compatible R2
configuration as vars. The Worker does not use a native filesystem or R2
binding; all object storage configuration is supplied through env values.

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

## Rollback

```bash
wrangler rollback --config wrangler.api.jsonc
```

Pages: redeploy a previous build, or promote a prior deployment in the
dashboard.
