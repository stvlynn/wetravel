# Hyperdrive

Hyperdrive pools and caches connections to an external PostgreSQL from Workers.
The API reads the connection string from the binding at runtime.

## Create

```bash
wrangler hyperdrive create wetravel-db \
  --connection-string "postgres://USER:PASSWORD@HOST:5432/DBNAME"
```

Copy the returned id into [wrangler.api.jsonc](wrangler.api.jsonc):

```jsonc
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<paste-id-here>" }]
```

## How the API consumes it

`apps/api/src/worker.ts` builds the container with
`env.HYPERDRIVE.connectionString`; everything else is identical to the Node
runtime. `nodejs_compat_v2` is required for `pg`.

## Local dev

For `wrangler dev`, set a local connection string:

```bash
wrangler hyperdrive create wetravel-db-local \
  --connection-string "postgres://postgres:postgres@localhost:5432/wetravel"
```

or provide `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` in `.dev.vars`.

## Update / delete

```bash
wrangler hyperdrive list
wrangler hyperdrive update <id> --connection-string "postgres://…"
wrangler hyperdrive delete <id>
```
