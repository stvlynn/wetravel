# WeChat Mini Program (Taro)

`apps/miniapp` is a separate Taro 4 + React + TypeScript workspace application.
It adapts OpenTrip to WeChat-native rendering and runtime APIs; it does not try
to compile the DOM/Base UI/MapLibre implementation from `apps/web`.

## Supported surface

- Native WeChat one-tap sign-in through `Taro.login()` and the server-side
  Better Auth adapter.
- Email/password sign-in through Better Auth as a secondary option.
- Bearer session persistence through Taro storage.
- Trip list with pull-to-refresh.
- Guided lightweight trip creation (title, destination, day count).
- Trip itinerary grouped by day, with stop voting for editors/owners.
- Mutation write-echo for newly created trips so a stale Hyperdrive list read
  does not hide the new item.

The desktop planner, MapLibre map, rich Markdown editor, agent stream, settings,
invites, and expense editing remain web-only until they receive deliberate
mini-program interaction designs. This is a platform boundary, not a hidden
fallback.

## FSD layout

```
src/
  app.tsx                 Taro application entry
  pages/                  Taro routes and page-owned state/UI
    auth/
    trips/
    trip-detail/
  entities/trip/          shared mini-program trip model and pure helpers
  shared/
    api/                   Taro.request adapter and typed endpoint functions
    auth/                  bearer token storage
    config/                build-time config and centralized Chinese copy
    ui/                    platform-neutral mini-program primitives
```

Imports follow `app -> pages -> entities -> shared`; page slices do not import
one another. Browser-specific code under `apps/web` is not imported. The API
remains a separate DDD/Hexagonal application: Taro/WeChat concerns stop at the
HTTP interface and Better Auth bearer adapter already present in infrastructure.

## Configuration

Copy `apps/miniapp/.env.example` to a gitignored `.env` and set:

```dotenv
TARO_APP_API_BASE_URL=https://api.example.com
```

Use a real HTTPS API origin in WeChat. Add that origin to the Mini Program
request-domain allowlist. Add API-managed uploads and any configured cover-image
CDN (for example the Unsplash image host) to the download domain allowlist. For
local Developer Tools, the domain check may be disabled temporarily; never ship
that setting as the production model.

Keep the committed `project.config.json` on the placeholder `touristappid`.
Set the real App ID in the local Developer Tools/private project configuration,
not in git.

## Commands

```bash
pnpm install
pnpm dev:miniapp
pnpm build:miniapp
```

Open `apps/miniapp` in WeChat Developer Tools; Taro writes compiled output to
`apps/miniapp/dist`.

## Authentication notes

`Taro.login()` returns a short-lived code. The client sends only that code to
`POST /api/auth/wechat-mini-program/sign-in`; the API performs
`jscode2session` with the Mini Program AppSecret and never returns WeChat's
`session_key`. Configure the server with `WECHAT_MINI_PROGRAM_APP_ID` and
`WECHAT_MINI_PROGRAM_APP_SECRET`.

Better Auth's bearer plugin exposes the signed session token in the
`set-auth-token` response header after a successful sign-in. The mini program
stores it with `Taro.setStorageSync` and sends it on subsequent requests as
`Authorization: Bearer <token>`. A `401` clears the local token and returns the
user to the auth page.

When the production captcha plugin protects email sign-in, a WeChat-compatible
captcha surface must supply `x-captcha-response`; do not disable CSRF/origin or
captcha checks globally to work around the platform. The present first slice is
intended for environments where email sign-in is not captcha-gated. Native
WeChat login itself is handled by the dedicated infrastructure auth adapter and
does not weaken captcha, CSRF, trip authorization, or domain boundaries.

## Data consistency

`POST /api/trips` returns the written `TripDto`. The client converts this DTO to
a `TripSummary`, stores a 60-second local echo, and overlays it on list reads.
This mirrors the web rule in [data-caching.md](data-caching.md) while avoiding a
React Query dependency in the small Taro client.

## Documentation sources

The implementation was checked against the current documentation through
Context7: Taro (`/nervjs/taro-docs`) for `Taro.login()`, WeChat Mini Program
documentation (`/websites/developers_weixin_qq_miniprogram_dev`) for
`jscode2session`, and Better Auth (`/better-auth/better-auth`, v1.6.23) for the
built-in web provider, custom endpoints, session cookies, and Bearer handoff.
