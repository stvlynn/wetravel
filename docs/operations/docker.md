# Docker deployment

Compose stack: `postgres` + `api` (Node Hono) + `web` (static build). Files in
[deploy/docker](../../deploy/docker/README.md). Reference:
[../reference/deployment-sources.md](../reference/deployment-sources.md).

## 1. Configure

```bash
cd deploy/docker
cp .env.example .env
# edit .env: set BETTER_AUTH_SECRET (>=32 chars), origins, db password
```

## 2. Build and start

```bash
docker compose up -d --build
```

Services:

- `postgres` — data volume `wetravel-pgdata`, healthchecked.
- `api` — waits for a healthy `postgres`, serves on port 8780, and stores
  filesystem uploads in the `wetravel-uploads` volume.
- `web` — serves the built SPA on port 8090.

## 3. Migrate + seed

```bash
docker compose exec api pnpm db:migrate
docker compose exec api pnpm db:seed
```

## 4. Verify

```bash
curl http://localhost:8780/api/health   # {"data":{"status":"ok"}}
open http://localhost:8090
```

## Logs

```bash
docker compose logs -f api
docker compose logs -f web
```

## Backup and restore

```bash
# backup
docker compose exec postgres pg_dump -U wetravel wetravel > backup.sql
# restore
cat backup.sql | docker compose exec -T postgres psql -U wetravel wetravel
```

## Notes

- The API uses a plain `DATABASE_URL` pointing at the `postgres` service; there
  is no Hyperdrive locally.
- `WEB_ORIGIN` must be listed in `TRUSTED_ORIGINS` for auth to accept requests
  from the SPA.
- `STORAGE_BACKEND=fs` and `STORAGE_ROOT=/app/apps/api/uploads` are explicit in
  the example env. The named volume preserves avatars across container rebuilds.
- S3-compatible storage can be used instead by setting `STORAGE_BACKEND=s3`
  and all `S3_*` variables described in [README.md](README.md).
