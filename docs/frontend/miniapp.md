# WeChat Mini Program (Taro)

`apps/miniapp` is a separate Taro 4 + React + TypeScript workspace application.
It adapts OpenTrip to WeChat-native rendering and runtime APIs; it does not try
to compile the DOM/Base UI/MapLibre implementation from `apps/web`.

## Supported surface

- Native WeChat sign-in with official avatar/nickname completion and the
  server-side Better Auth adapter.
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
TARO_APP_API_BASE_URL=http://localhost:8780
TARO_APP_WECHAT_APP_ID=wx……
```

Local debug defaults to the API on `:8780` (no Vite proxy). Production builds
should use a real HTTPS API origin. Add that origin to the Mini Program
request-domain allowlist. Add API-managed uploads and any configured cover-image
CDN (for example the Unsplash image host) to the download domain allowlist. For
local Developer Tools, enable **不校验合法域名** so `http://localhost:8780`
works; never ship that setting as the production model.

Keep the committed `project.config.json` free of any AppID. Local WeChat
Developer Tools reads AppID from gitignored
`apps/miniapp/project.private.config.json`, which Make syncs via
`make miniapp-sync-appid` (also run by every `make miniapp*` target) from
`apps/miniapp/.env` → `TARO_APP_WECHAT_APP_ID`.

API login credentials stay in the repo root `.env`
(`WECHAT_MINI_PROGRAM_APP_ID` / `WECHAT_MINI_PROGRAM_APP_SECRET`) and must never
be placed in the Mini Program client or `project.config.json`.

## Commands

```bash
make install
make miniapp              # sync AppID → build → open DevTools → watch
make dev-miniapp          # sync AppID + Taro weapp watch
make build-miniapp        # sync AppID + one-shot weapp build → apps/miniapp/dist
make miniapp-open         # sync AppID + clear DevTools cache + reopen project
make miniapp-sync-appid   # only rewrite project.private.config.json from apps/miniapp/.env
make miniapp-clear-cache  # clear file/compile cache + rebuild file watcher
make dev-miniapp-api      # Postgres + API (:8780) + Taro watch
```

Taro writes compiled output to `apps/miniapp/dist`. Import **`apps/miniapp`**
(not `dist/`) in WeChat Developer Tools — `project.config.json` sets
`miniprogramRoot` to `dist/`. `make miniapp-open` uses the official DevTools
CLI to open the project, clear the project `file` and `compile` caches, rebuild
the file watcher, then close/reopen the project. It intentionally preserves
login/session caches. Manually enable **设置 → 安全设置 → 服务端口** first;
the current DevTools version does not reliably activate the service when its
CLI confirmation is automated. Override the CLI binary with
`WECHAT_DEVTOOLS_CLI=…` when it is not installed at the macOS default.

`make dev` starts web + api only; Mini Program debug is opt-in via the targets
above.

## Authentication notes

`Taro.login()` returns a short-lived code. The client sends only that code to
`POST /api/auth/wechat-mini-program/sign-in`; the API performs
`jscode2session` with the Mini Program AppSecret and never returns WeChat's
`session_key`. Configure the server with `WECHAT_MINI_PROGRAM_APP_ID` and
`WECHAT_MINI_PROGRAM_APP_SECRET`.

The auth page uses the official avatar/nickname filling controls (WeChat base
library 2.21.2 or newer) in two steps so the initial screen shows only the
WeChat login action:

- `Button openType="chooseAvatar"` requests a reviewed avatar first. Only after
  `onChooseAvatar` returns an avatar does the nickname step appear.
- `Input type="nickname" name="nickname"` then supplies the native nickname
  picker and contributes its final value through `Form.onSubmit`, confirmed with
  a `formType="submit"` button.
- On base library 2.29.1 or newer, `onNickNameReview` must pass before login.
  Older supported libraries continue from the submitted nickname value.

The client waits for the final nickname, nickname review when available, and
`onChooseAvatar` in any event order. Empty/rejected nicknames, cancelled or
rejected avatars, and duplicate taps do not call `Taro.login()`. The successful
sequence is fixed: WeChat code exchange → Better Auth `update-user` → upload
the temporary avatar file to `POST /api/users/avatar` → persist the bearer token
→ `reLaunch` to trips. Failures remain on the auth page and can safely retry;
the `wxfile://` temporary path is never persisted.

**Testing WeChat one-tap login / preview needs a real Mini Program AppID in
`apps/miniapp/.env` — it cannot work with an empty DevTools AppID.** Two
conditions must both hold:

1. `apps/miniapp/.env` has `TARO_APP_WECHAT_APP_ID` set (synced into
   `project.private.config.json` by `make miniapp-sync-appid` /
   `make miniapp*`). Under an empty AppID, DevTools preview returns
   `41002 appid missing`, and `make miniapp-open` refuses to launch.
2. The API has `WECHAT_MINI_PROGRAM_APP_ID` + `WECHAT_MINI_PROGRAM_APP_SECRET`
   set for that same Mini Program. When unset, the Better Auth endpoint is not
   mounted and the sign-in returns `404`; the client surfaces this as
   "微信登录尚未启用" rather than a generic failure. Email/password sign-in
   still works without WeChat credentials.

### Preview error: `dist/game.json` / `800059`

Local builds correctly emit `dist/app.json` with
`compileType: "miniprogram"`. If DevTools still asks for `dist/game.json`, the
bound AppID is registered as a **小游戏** (or its service category includes
「游戏」). WeChat then forces the game pipeline regardless of local config —
[official community confirmation](https://developers.weixin.qq.com/community/develop/doc/000aa03ddc0bd841d467ff6c351000):
once the account category is game, it cannot be changed back to a mini program.

Fix: register / use a normal **小程序** AppID (do not pick game categories),
put it in `apps/miniapp/.env` as `TARO_APP_WECHAT_APP_ID`, mirror the same ID +
secret in the root API `.env`, then `make miniapp-sync-appid` and re-import
`apps/miniapp` in DevTools (clear cache if the old game AppID was cached).

## Auth screen assets

The sign-in brand mark and the WeChat button glyph are inline SVGs embedded as
base64 `background-image` data URIs in `pages/auth/page.css` (weapp renders
base64 backgrounds reliably; it has no DOM/`<svg>`). The brand mark reuses the
product app icon (`apps/web/public/pwa-192x192.svg`); the WeChat glyph matches
the web `WechatIcon`. Colors track the shared palette
(`apps/web/src/app/styles/tokens/colors.css`): primary buttons use navy ink
(`--primary` `#28304a`), cornflower (`--brand` `#3f6fc9`) is the accent, and the
WeChat button keeps the mandated WeChat green `#07c160`.

Better Auth's bearer plugin exposes the signed session token in the
`set-auth-token` response header after a successful sign-in. The mini program
keeps it in memory while completing a WeChat profile, then stores it with
`Taro.setStorageSync` only after the nickname and avatar succeed. Subsequent
requests send it as
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
`jscode2session`, `chooseAvatar`, nickname input/review, and forms, and Better
Auth (`/better-auth/better-auth`, v1.6.23) for the built-in web provider, custom
endpoints, session cookies, `update-user`, database hooks, and Bearer handoff.
