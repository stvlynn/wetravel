# 0010 — Mini Program native page stack over a single WebView wrapper

## Status

Accepted. Extends [0009](0009-mini-program-pwa-webview-shell.md).

## Context

The 0009 shell hosted the whole PWA in one full-screen `<web-view>` with a
custom navigation style. Navigation, back handling, titles, and sharing all
lived inside the web page, so the Mini Program felt like a wrapped website:
no native navigation bar, no hardware/swipe back semantics, no share cards.

WeChat imposes hard platform limits on any richer integration:

- `<web-view>` fills the page and cannot be combined with native components;
- the page and the shell may communicate only through the JSSDK
  (`wx.miniProgram.navigateTo/redirectTo/reLaunch/switchTab/navigateBack/
  postMessage/getEnv`);
- `postMessage` is delivered only at back navigation, component destroy,
  share, and copy-link time — there is no real-time channel;
- rebuilding the product UI natively (Taro) was already rejected in 0007/0009
  because MapLibre GL and the DOM-based design system cannot run in the Mini
  Program renderer.

## Decision

- Model each page-level PWA route as its own native page hosting a
  `<web-view>`: `pages/home` (`/`), `pages/trip` (`/trips/:id`),
  `pages/invite` (`/invite/:token`), all with the default native navigation
  bar.
- Drive page-level transitions from the embedded PWA through the JSSDK:
  `navigateTo` pushes trip/invite pages, `reLaunch` returns home; the native
  back button and swipe-back pop the stack.
- Keep in-trip panels (map, schedule, reservations, budget) as PWA state; do
  not adopt an app-level native `tabBar`.
- Keep the shell bearer in `App.globalData` (memory only) and mint a
  single-use bridge code per native page; the PWA prefers an existing session
  cookie and only exchanges a code when it has none, so cookie sharing across
  WebViews is an optimization, not a prerequisite.
- Use `postMessage` exclusively for share payloads; `onShareAppMessage`
  produces cards that deep-link back into the correct native page with the
  PWA path in the query.
- Mirror titles onto the native bar via `document.title` (plus an optional
  `title` query applied before the WebView loads).

## Consequences

- The Mini Program gains native navigation, back gestures, titles, share
  cards, and deep links while the PWA stays the only product UI.
- The shell grows a small shared Page factory and session module but remains
  dependency-free; there is still no Taro or duplicated trip UI.
- Page-level `navigate()` in the PWA is container-aware; an SPA history
  fallback covers the window before the JSSDK loads.
- Real-time web-to-shell messaging remains impossible by platform design;
  anything stateful continues to go through the shared API.
- The `navigateTo` stack limit is avoided by resetting to home with
  `reLaunch` for "back to trips" transitions.
