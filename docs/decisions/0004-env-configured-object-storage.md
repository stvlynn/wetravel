# 0004 — Environment-configured object storage

## Status

Accepted; Worker-specific S3 credential handling is superseded by
[0008](0008-native-r2-worker-binding.md).

## Context

User avatars must persist in both Docker and Cloudflare deployments. Native
OpenDAL Node bindings cannot be bundled for Cloudflare Workers, and an
unmounted container filesystem loses uploads when the API container is
recreated. Deployment operators also require storage selection through env
configuration rather than code changes or runtime-specific bucket bindings.

## Decision

- Require `STORAGE_BACKEND=fs|s3`; reject missing or unknown values at startup.
- Implement a runtime-neutral application port using `Uint8Array` payloads.
- Use a Node filesystem adapter with a Docker named volume for `fs`.
- Use AWS SDK for JavaScript v3 for S3-compatible storage in Node and Workers.
- Configure S3, Cloudflare R2, and compatible services entirely with `S3_*`
  environment variables and secrets.
- Keep runtime-specific adapter selection in the Node and Worker entry points so
  the Worker dependency graph cannot import filesystem code.

## Consequences

- Node and cross-account deployments may use S3 API credentials; same-account
  Cloudflare Workers use the native R2 binding defined by ADR 0008.
- The Worker bundle contains the modular S3 client but no native binaries.
- Docker uploads survive container replacement through `opentrip-uploads`.
- Invalid storage configuration fails visibly during startup rather than
  falling back to ephemeral storage.
- The same `FileStorage` port serves avatars (`avatars/…`) and trip note
  images (`trips/…`); public delivery is `GET /api/uploads/*` with a path
  allowlist for both namespaces.
