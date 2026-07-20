# Docker deployment

Compose stack: `postgres` + `api` (Hono via tsx) + `web` (built SPA on nginx,
proxying `/api` to the API). Walkthrough:
[../../docs/operations/docker.md](../../docs/operations/docker.md).

## Files

- [compose.yaml](compose.yaml) — the three services, persistent database/upload
  volumes, and healthchecks.
- [api.Dockerfile](api.Dockerfile) — API image (workspace install, `pnpm start`).
- [web.Dockerfile](web.Dockerfile) — build SPA, serve with nginx.
- [nginx.conf](nginx.conf) — SPA fallback + `/api` reverse proxy.
- [.env.example](.env.example) — environment template.

## Run

```bash
cd deploy/docker
cp .env.example .env      # set BETTER_AUTH_SECRET etc.
# Optional: set Google and/or WeChat credential pairs from .env.example.
docker compose up -d --build
```

Then apply schema + seed:

```bash
docker compose exec api pnpm db:migrate
docker compose exec api pnpm db:seed
```

## Verify

```bash
curl http://localhost:8780/api/health   # {"data":{"status":"ok"}}
open http://localhost:8090
```

## Logs, backup

API logs use the same request/turn/message fields as Cloudflare; see
[`docs/operations/observability.md`](../../docs/operations/observability.md).

```bash
docker compose logs -f api
docker compose exec postgres pg_dump -U opentrip opentrip > backup.sql
```

## Notes

- The browser talks only to `web` (port 8090); nginx proxies `/api` to `api`,
  so auth cookies are same-origin.
- The API connects to Postgres via `DATABASE_URL` (no Hyperdrive locally).
- Avatar files use the `opentrip-uploads` named volume by default. Storage
  backend and root are selected explicitly in `.env`.
