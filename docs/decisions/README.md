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
- [0005-trip-agent.md](0005-trip-agent.md) — non-intrusive shared trip agent
  using Vercel AI SDK, AI SDK UI, proactive toasts, and pending patches.
- [0006-mutation-echo-over-refetch.md](0006-mutation-echo-over-refetch.md) —
  echo mutation DTOs into React Query instead of immediate list refetch under
  Hyperdrive.
- [0007-separate-taro-miniapp-client.md](0007-separate-taro-miniapp-client.md) —
  superseded historical decision to keep a separate Taro client.
- [0008-native-r2-worker-binding.md](0008-native-r2-worker-binding.md) — use a
  native same-account R2 binding in Workers instead of S3 credential secrets.
- [0009-mini-program-pwa-webview-shell.md](0009-mini-program-pwa-webview-shell.md)
  — replace the duplicated Taro client with a native login shell hosting the
  responsive PWA through a secure one-time-code bridge.
- [0010-miniapp-native-page-stack.md](0010-miniapp-native-page-stack.md) — one
  native page per page-level PWA route so WeChat provides native navigation,
  back gestures, titles, share cards, and deep links.
- [0011-wechat-identity-and-placeholder-email.md](0011-wechat-identity-and-placeholder-email.md)
  — scope OpenID/UnionID by issuer, keep Better Auth placeholder email internal,
  and fail closed on identity conflicts.
