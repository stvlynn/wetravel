# 0007 — Separate Taro client for the WeChat Mini Program

## Context

The browser application depends on DOM-oriented coss/Base UI primitives,
MapLibre GL, Vite routing, and browser cookie handling. Taro renders WeChat Mini
Program components and supplies different navigation, storage, and request
APIs. Attempting to compile the browser tree directly would leak platform
conditionals across FSD slices and turn the web UI kit into a lowest-common-
denominator abstraction.

## Decision

Add `apps/miniapp` as a separate Taro React workspace application. It follows
FSD independently, shares the backend HTTP contract rather than frontend source
files, and uses `Taro.request` plus Better Auth bearer sessions. The Hono API,
application use cases, and trip domain remain unchanged.

The initial client supports auth, trip list/create/detail, and voting. New
mini-program capabilities receive platform-appropriate page designs and reuse
the same DTO/endpoint contracts. Cross-client source packages may be extracted
only after actual framework-independent reuse emerges.

## Consequences

- Web and WeChat can evolve interaction patterns without platform conditionals.
- DTO types are currently mirrored in each client and must stay aligned with
  `docs/backend/api`; a generated contract package may replace this later.
- Production email captcha needs a mini-program-compatible challenge before the
  email login surface can be enabled in captcha-gated deployments.
- Taro/WeChat dependencies stay outside the DDD backend core.

## Status

Accepted.
