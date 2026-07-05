# Architecture Decision Records

ADRs capture significant, hard-to-reverse decisions and their context. Add a new
numbered file per decision; keep this list in sync (checked by
`scripts/docs-check.mjs`).

## Format

Each ADR uses: **Context**, **Decision**, **Consequences**, **Status**
(`Accepted` / `Superseded by NNNN`).

## Records

- [0001-architecture-and-stack.md](0001-architecture-and-stack.md) — monorepo,
  FSD frontend, DDD/Hexagonal backend, and the core stack.
- [0002-cloudflare-and-docker-deploy.md](0002-cloudflare-and-docker-deploy.md) —
  dual deployment targets and the Hyperdrive vs `DATABASE_URL` split.
- [0003-i18n.md](0003-i18n.md) — react-i18next and centralized copy.
- [0004-env-configured-object-storage.md](0004-env-configured-object-storage.md) —
  explicit filesystem or S3-compatible avatar storage across runtimes.
