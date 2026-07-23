# WeChat Mini Program PWA shell

`apps/miniapp` is a dependency-free native WeChat Mini Program shell. It owns
WeChat login, secure browser-session handoff, the native page stack (navigation
bar, back button, swipe-back), share cards, and WebView failure recovery. All
product UI is the responsive PWA from `apps/web`.

## Hybrid native architecture

The shell is not a single-page WebView wrapper. Each page-level PWA route is
hosted by its own native page so WeChat provides real native navigation:

| Native page | PWA route | Role |
| --- | --- | --- |
| `pages/home/home` | `/`, `/today`, `/journal`, `/journal/:entryId` | Stack bottom; the authenticated home hub (Trips, Today, Travelogues) and the travelogue reader |
| `pages/trip/trip` | `/trips/:id` | Trip planner; share-card target |
| `pages/invite/invite` | `/invite/:token` | Invite acceptance |

Every native page uses the default (native) navigation bar and embeds a
`<web-view>` that loads `https://<web-origin>/miniapp#code=…&path=…`. The
target PWA path and the single-use auth code travel in the URL fragment, which
the PWA strips before making any request.

Page-level transitions are driven from the PWA through the official JSSDK
(`wx.miniProgram.*`, loaded on demand by `shared/lib/wechat-bridge.ts` in
embedded mode — no `wx.config` signature is required for this API family):

- opening a trip or invite calls `wx.miniProgram.navigateTo` with the PWA path
  (and an optional `title` used to pre-label the native bar) in the query;
- the home hub surfaces (`/`, `/today`, `/journal`) and the travelogue reader
  (`/journal/:entryId`) all live in the home page's WebView: switching between
  them navigates via SPA history in place, so the bottom hub navigation does not
  push native pages;
- "back to trips" (returning to any hub surface from a deeper native page such
  as a trip) calls `wx.miniProgram.reLaunch` to the home page, which is
  stack-safe from any entry point (including share cards) and avoids the
  ten-page stack limit;
- the native back button and iOS swipe-back pop the stack without any web
  code.

In-page panels (map / schedule / reservations / budget) remain PWA state inside
one WebView; there is no app-level native `tabBar` because those panels belong
to a single trip, not to the app shell.

The native navigation bar title mirrors the WebView's `document.title`, which
the PWA sets per page (`useDocumentTitle`); the shell also applies the `title`
query via `wx.setNavigationBarTitle` before the WebView finishes loading.

## Runtime flow

1. A native page loads and calls into `miniprogram/lib/session.js`.
2. On first use the shell calls `wx.login()` and exchanges the code at
   `POST /api/auth/wechat-mini-program/sign-in` for a Better Auth bearer. The
   bearer lives only in `App.globalData` (memory) — never persisted, never in
   a URL.
3. Each native page mints its own hashed, single-use, three-minute bridge code
   at `POST /api/mobile-auth/webview/mint`. If the bearer expired, the shell
   retries once with a fresh `wx.login`.
4. The page opens `https://<web-origin>/miniapp#code=…&path=…`.
5. The PWA removes the fragment and resolves Better Auth through the single
   reactive `useSession` owner mounted by `AppContent`. Only when that initial
   result is signed out does it exchange the code at
   `POST /api/mobile-auth/webview/exchange` for the HttpOnly Better Auth
   cookie, then refetches that same session owner. This keeps multi-page stacks
   working regardless of whether the WebView shares cookies across native
   pages, without a second independent `getSession` request.
6. The PWA replaces its location with the target path (an internal redirect —
   never a native stack push) and renders in embedded mode.

Critical application state remains on the API. `wx.miniProgram.postMessage` is
used only for share payloads because WeChat delivers it exclusively at selected
lifecycle moments (back navigation, component destroy, share, copy link); it is
never a real-time transport.

## Share cards and deep links

- The PWA queues the current share context (`{ type: "share", title, path,
  imageUrl }`) with `postMiniappShareContext` whenever an embedded trip page is
  active.
- The shell collects payloads in `bindmessage` and answers
  `onShareAppMessage` with a card pointing at the right native page, carrying
  the PWA `path` (and `title`) in its query.
- Opening a share card lands on that native page directly; `onLoad` sanitizes
  the `path` query (internal, single-slash-rooted paths only) and boots the
  WebView at the requested route.

## Native shell source

```text
app.js                  App.globalData.bearer (memory only)
app.json                pages/home, pages/trip, pages/invite; native nav bar
app.wxss                shared loading/error styles
lib/copy.js             single source of shell copy
lib/session.js          wx.login + sign-in + per-page mint
lib/webview-page.js     shared Page factory (connect, share, deep link)
lib/webview-shell.wxml  shared <web-view> + loading/error markup
pages/{home,trip,invite}/
```

There is no Taro, React, duplicated trip model, or native product page. Native
UI is limited to the navigation bar plus loading, error, and retry states.

## Configuration

Copy `apps/miniapp/.env.example` to the gitignored `.env`:

```dotenv
MINIAPP_APP_ID=wx…
MINIAPP_API_BASE_URL=https://api.example.com
MINIAPP_WEB_BASE_URL=https://app.example.com
```

Run `make miniapp-sync-config`. It generates:

- `project.private.config.json` with the AppID;
- `miniprogram/config.js` with the public API and PWA origins.

Both files are gitignored. The AppSecret stays on the API as
`WECHAT_MINI_PROGRAM_APP_SECRET`.

Production WeChat configuration requires:

- the PWA origin in **业务域名** for `<web-view>`;
- the API origin in **request 合法域名**;
- valid HTTPS certificates;
- a normal Mini Program AppID, not a Mini Game AppID.

## Commands

```bash
make miniapp-sync-config
make miniapp-open
make miniapp-clear-cache
make miniapp
make dev-miniapp-api
```

There is no mini-program build or watcher. WeChat DevTools reads the native
source directly from `apps/miniapp/miniprogram`.

## Embedded PWA behavior

`/miniapp` is a bootstrap route handled before the regular auth gate. Embedded
mode:

- keeps the auth gate blocked until the initial session result or bridge
  refetch is definitive, so an empty session atom can never flash the sign-in
  surface; after that first result, background refetches leave an in-progress
  OTP or two-factor form mounted;
- shows only a neutral, accessible loading spinner during bridge work rather
  than presenting repeat page loads as a new login;
- suppresses browser-only install/update prompts, mobile onboarding, and
  system-notification setup;
- preloads the JSSDK bridge and routes page-level `navigate()` calls through
  the native stack (with an SPA history fallback while the JSSDK loads);
- hides the self-drawn back button and title on the mobile planner header and
  the brand label on the trips header — the native navigation bar owns them;
- keeps the in-trip tab bar, sheets, dialogs, uploads, map, agent, and API
  caching behavior unchanged — sheet/dialog overlays follow the Visual
  Viewport keyboard policy documented in [mobile-pwa.md](mobile-pwa.md).

The Service Worker never caches auth, mutation, or upload requests. Bridge
responses are `Cache-Control: private, no-store`.

## Verification

Test in WeChat DevTools and real iOS/Android WeChat clients:

- first and repeat login;
- forward native-page navigation never renders the sign-in surface between the
  bridge spinner and the authenticated target route;
- expired and reused bridge codes;
- cookie persistence across native pages (home → trip → back) and logout;
- native back button and swipe-back from the trip page;
- share a trip, open the share card cold (shell must boot straight into the
  trip), and forward it;
- avatar and trip-media uploads;
- create-trip wizard and other sheet inputs remain visible above the virtual
  keyboard on iOS and Android WeChat;
- planner, map, and agent behavior;
- offline and upstream failure recovery.
