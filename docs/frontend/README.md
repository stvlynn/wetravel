# Frontend (Feature-Sliced Design)

The browser frontend (`apps/web`) is a React + TypeScript + Vite PWA organized
with Feature-Sliced Design v2.1. The dependency-free WeChat shell
(`apps/miniapp`) authenticates natively and hosts that same responsive PWA in a
WebView. Reference:
[../reference/frontend-sources.md](../reference/frontend-sources.md).

## Layers

`app` -> `pages` -> `widgets` -> `features` -> `entities` -> `shared`.
Imports go only downward. Details in [layers.md](layers.md).

## Pages First

Prototype-specific logic stays in the page (`pages/travel-planner`,
`pages/trips`) with page-private widgets. Only genuinely reusable code
(UI primitives, API client, map wrapper, formatters, i18n) lives in `shared`.

## Unauthenticated routing

Signed-out web visitors land on the marketing page (`pages/landing`) at the
root; the auth form lives at `/signin`. Deep links (e.g. a shared trip) route
straight to sign-in so the target path survives login, and embedded WeChat
sessions skip the landing entirely. The gate lives in `app/App.tsx`. Landing
copy is centralized in the `landing` i18n namespace (EN + 中文) and its
screenshots reuse the README captures under `pages/landing/assets`.

## Path aliases

`@/*` maps to `apps/web/src/*` (see `apps/web/tsconfig.json` and
`apps/web/vite.config.ts`). Import primitives as `@/shared/ui/button`, the map
as `@/shared/ui/map`, etc.

## Public API

Each slice exposes an `index.ts`. Import the slice, never its internals:

```ts
// good
import { Button } from "@/shared/ui/button";
// bad
import { Button } from "@/shared/ui/button/button";
```

## Where does code go?

| Kind | Location |
| --- | --- |
| Providers, router, global styles | `app/` |
| A route/screen composition | `pages/<name>/` |
| Reused composite block | `widgets/<name>/` |
| Reusable user scenario | `features/<name>/` |
| Reusable domain data/rules | `entities/<name>/` |
| UI primitives, api client, map, i18n, utils | `shared/` |

## Related

- [ui-system.md](ui-system.md) — cossUI tokens, primitives, polish.
- [miniapp.md](miniapp.md) — native WebView shell, auth bridge, and setup.
- [map.md](map.md) — MapLibre wrapper.
- [i18n.md](i18n.md) — internationalization.
- [data-caching.md](data-caching.md) — React Query write-echo vs Hyperdrive
  stale SELECTs (create-trip and other mutations).
- [mobile-pwa.md](mobile-pwa.md) — mobile breakpoint contract, planner mobile
  shell, responsive dialogs, PWA install metadata and headers.
