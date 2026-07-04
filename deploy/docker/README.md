# Docker deployment

Compose stack: `postgres` + `api` (Hono via tsx) + `web` (built SPA on nginx,
proxying `/api` to the API). Walkthrough:
[../../docs/operations/docker.md](../../docs/operations/docker.md).

## Files

- [compose.yaml](compose.yaml) — the three services + volume + healthchecks.
- [api.Dockerfile](api.Dockerfile) — API image (workspace install, `pnpm start`).
- [web.Dockerfile](web.Dockerfile) — build SPA, serve with nginx.
- [nginx.conf](nginx.conf) — SPA fallback + `/api` reverse proxy.
- [.env.example](.env.example) — environment template.

## Run

```bash
cd deploy/docker
cp .env.example .env      # set BETTER_AUTH_SECRET etc.
docker compose up -d --build
```

Then apply schema + seed:

```bash
docker compose exec api pnpm migrate
docker compose exec api pnpm seed
```

## Verify

```bash
curl http://localhost:8787/api/health   # {"data":{"status":"ok"}}
open http://localhost:8080
```

## Logs, backup

```bash
docker compose logs -f api
docker compose exec postgres pg_dump -U wetravel wetravel > backup.sql
```

## Notes

- The browser talks only to `web` (port 8080); nginx proxies `/api` to `api`,
  so auth cookies are same-origin.
- The API connects to Postgres via `DATABASE_URL` (no Hyperdrive locally).
