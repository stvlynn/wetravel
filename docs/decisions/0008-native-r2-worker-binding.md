# 0008 — Native R2 binding for Workers

## Status

Accepted.

## Context

The API Worker and production R2 bucket run in the same Cloudflare account.
Using R2 through the S3-compatible API required long-lived access-key secrets
inside the Worker and caused avatar uploads to fail when those credentials were
invalid. Cloudflare recommends native R2 bindings for same-account Workers.

## Decision

- Use `STORAGE_BACKEND=r2` in Cloudflare deployments.
- Inject `R2_FILE_STORAGE` from the `R2_BUCKET_NAME` GitHub Actions variable at
  deploy time; never commit a production bucket name.
- Access objects through the Workers R2 API without S3 credentials.
- Keep the S3 adapter for Node deployments and cross-account interoperability.

## Consequences

- Production Workers no longer receive `S3_ACCESS_KEY_ID` or
  `S3_SECRET_ACCESS_KEY`.
- Bucket access follows the Worker binding and Cloudflare account permissions.
- The runtime-neutral `FileStorage` application port and public upload routes
  remain unchanged.
