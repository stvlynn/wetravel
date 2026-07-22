# Mobile adaptation and PWA install

How the SPA adapts to narrow viewports and installs as a PWA. The service
worker and runtime caching strategy are configured in `apps/web/vite.config.ts`
(vite-plugin-pwa, `injectManifest`) with the worker source at
`apps/web/src/sw.ts` and lifecycle toasts in
`apps/web/src/app/providers/PwaLifecycle.tsx`.

## Breakpoint contract

One breakpoint separates the mobile and desktop React layouts: Tailwind `md`
(768px). CSS uses `md:` / `max-md:` variants; JS uses `useIsMobile()` from
`@/shared/lib`, whose `MOBILE_MEDIA_QUERY` is `(max-width: 767.9px)` so the
JS branch and CSS variants never disagree at exactly 768px. Do not introduce
additional React layout-switching breakpoints; finer CSS composition tuning is
allowed. In the planner's compact desktop range (`md` through `2xl`), the
existing `AgentDrawer` becomes a right-side overlay instead of consuming a
third grid column. This preserves usable map/schedule width without introducing
a separate tablet shell. From `md` through `2xl`, an open drawer takes over the
main workspace completely instead of leaving an unusable map sliver. At `2xl`
and above it returns to the reserved three-pane composition.

## Planner mobile shell

`TravelPlannerPage` renders one of two shells around the same state and the
same always-mounted mode panes:

- **Desktop** — the splitter layout: itinerary `AppSidebar`, main panel with
  icon tabs, `AgentDrawer` side panel. At compact desktop widths the drawer
  overlays the main pane; wide screens reserve space beside it.
- **Mobile** (`useIsMobile()`) — a column shell, page-private under
  `pages/travel-planner/ui/mobile/`:
  - `MobilePlannerHeader` — back/rename row plus the agent open button.
  - `MobileTabBar` — bottom navigation with the four modes (Map, Schedule,
    Reservations, Budget), `aria-current` on the active item, safe-area
    bottom padding.
  - `MobileItinerarySheet` — a floating pill on the map mode that opens the
    day-grouped itinerary (the desktop `Sidebar` component) as a bottom
    sheet.
  - `MobileStopDetailSheet` — the map's bottom detail surface; opens when a
    stop is selected on the map mode and reuses `StopDetail`.
  - `MobileAgentSheet` — full-height agent chat wrapping `AgentChat`.

All four mode panes stay mounted (`PlannerPane` in `TravelPlannerPage`)
and inactive panes are hidden with `visibility` so switching modes preserves
scroll position and keeps the MapLibre canvas alive. This applies to both
shells.

On the mobile map mode the search control spans the top edge and the desktop
day legend is hidden — the itinerary pill occupies that corner (see
[map.md](map.md)).

## Home mobile shell

The authenticated home content hub keeps the same three destinations as the
desktop sidebar but presents them as a safe-area-aware bottom navigation:
Trips, Today, and Travelogues. A compact sticky header holds the brand and
account menu. Every surface reserves bottom padding so content and primary
actions do not sit behind the navigation. The same card components collapse
from the desktop content grid into one column; trip map thumbnails remain
non-interactive so vertical swipes always scroll the page.

The travelogue composer uses `DialogSheetPopup` as a full-height editor below
`md`, with iOS-safe 16px text controls and safe-area padding in both the header
and footer. The reader hides its sticky section rail while preserving the
article and AI input as one continuous mobile column. The Today place card asks
for a city or region instead of requesting location permission again, remembers
the selection per user in localStorage, and renders current weather from the
shared weather API. The mobile stop-detail drawer exposes
the same “write in travelogue” action as desktop; it opens the full-height
composer with the stop title and trip association already filled. The frontend preview stores a
versioned local draft document per user in localStorage. It does not claim
offline sync, sharing, or a live AI response: the UI states that drafts and
excerpt-based answers remain local until the backend travelogue and media
adapters are implemented.

## Drawer and responsive dialogs

- `@/shared/ui/drawer` — Base UI Dialog styled as a mobile sheet.
  `DrawerContent side="bottom"` slides a rounded panel up from the bottom
  edge (drag-handle affordance, safe-area bottom padding);
  `side="full"` covers the viewport. Use it for mobile-only surfaces.
- `DialogSheetViewport` + `DialogSheetPopup` (`@/shared/ui/dialog`) — the
  responsive dialog policy: full-width bottom sheet below `md`, centered
  card above. Sizes: `sm` (440px), `md` (28rem), `lg` (2xl). All planner
  and trips dialogs use these; footers that touch the bottom edge pad with
  `pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-6`.
- `SettingsDialog` goes full-screen below `md` instead of a sheet (it is a
  two-pane surface). Small confirm dialogs (`AlertDialog`) stay centered at
  every size.

Sheet heights that must track the visible area (including when the virtual
keyboard is open) use **percentages of the Visual Viewport parent**
(`h-[70%]`, `max-h-[min(92%,760px)]`), not bare `dvh` — WebKit does not
shrink `dvh` for the keyboard.

## Virtual keyboard and Visual Viewport

Bottom sheets and full-screen dialogs are `position: fixed` overlays. By
default mobile browsers use `interactive-widget=resizes-visual`: only the
Visual Viewport shrinks when the keyboard opens, so fixed overlays stay
anchored to the Layout Viewport and cover the focused input (common in the
PWA and WeChat WKWebView).

Root fix (not per-form scroll hacks):

1. **`interactive-widget=resizes-content`** on the viewport meta in
   `apps/web/index.html` — Chromium / Firefox resize the Layout Viewport
   (and therefore `dvh` / fixed overlays) with the keyboard
   ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag#interactive-widget),
   [Chrome](https://developer.chrome.com/blog/viewport-resize-behavior/)).
2. **`installVisualViewportCssVars()`** (`@/shared/lib`) — mirrors
   `window.visualViewport` into `:root` CSS variables (`--vv-top`,
   `--vv-left`, `--vv-width`, `--vv-height`, `--keyboard-inset`). Mounted
   once from `AppProviders`. Covers WebKit (iOS Safari / WeChat), which
   still ignores `interactive-widget`.
3. **Overlay viewports** (`DialogSheetViewport`, `DrawerContent`,
   `SettingsDialog`) use `VISUAL_VIEWPORT_FIXED_CLASS` so they occupy the
   visible box. `DialogPanel` / `DrawerPanel` scroll the focused control
   into view after focus when the panel itself overflows.

Do not add wizard-specific `scrollIntoView` or hardcoded keyboard offsets
for new forms — reuse these primitives.

## Safe areas

`index.html` sets `viewport-fit=cover`, so `env(safe-area-inset-*)` is
non-zero on notched devices in standalone mode. Pad any surface that touches
a screen edge on mobile: top bars use
`pt-[max(<fallback>,env(safe-area-inset-top))]`, bottom bars and sheet
footers use the matching `safe-area-inset-bottom` form. The Drawer primitive
and the sheet dialog footers already do this.

## Mobile permission onboarding

`features/mobile-onboarding` (`MobileOnboarding`, mounted from the app
providers) opens a bottom Drawer on first mobile visit (`useIsMobile()`),
walking through up to three steps — each asked at most once, with the
outcome persisted under the `opentrip.mobile-onboarding.v1` localStorage
key:

1. **Install** — offers to add OpenTrip to the home screen. On Chromium the
   `beforeinstallprompt` event is captured at module scope
   (`model/install-prompt.ts`) and replayed from the button via
   `promptInstall()`, which awaits the browser dialog's `userChoice`: the
   step is stored as accepted only when the user accepts **that** dialog
   (dismissing it stores a dismissal, keeping the settings re-offer alive).
   On iOS (no install API) the step shows share-menu instructions instead.
   Skipped in standalone display mode or when neither path applies.
2. **Notifications** — requests `Notification` permission so toasts can
   reach the user as system push while the app is backgrounded (see the
   bridge below). Skipped when permission is already decided.
3. **Location** — triggers a high-accuracy `getCurrentPosition` call so the
   browser asks for precise location up front; the map's
   `GeolocateControl` then starts without an extra permission prompt.
   Skipped when the Permissions API reports the choice as already made.

The sheet opens after a short delay (`ONBOARDING_OPEN_DELAY_MS`) to give
`beforeinstallprompt` time to fire. Dismissing the sheet marks the
remaining steps as dismissed — the flow never re-nags.

A declined prompt is not a dead end: the same slice exports
`PermissionSettings`, a mobile-only "Device permissions" section rendered
in the settings preferences pane. It shows the live state of all three
asks (via the Permissions API `change` events and the deferred install
prompt) and re-offers the action where the browser still allows it; a
`denied` permission surfaces a pointer to the browser settings instead,
since the page cannot re-prompt.

## Toast → system notification bridge

`installSystemNotificationBridge()` (`@/shared/ui/toast`, called once from
the app providers) decorates `toastManager.add` so that on mobile
(`MOBILE_MEDIA_QUERY`), with Notification permission granted and the page
**hidden**, toasts are mirrored as system notifications via the service
worker registration's `showNotification` (Android requires SW delivery;
`new Notification` is the fallback). A visible page keeps in-app toasts
only — a system banner would duplicate them. `loading` toasts and toasts
with non-string titles are never mirrored.

## Install metadata and icons

- `index.html` carries the `theme-color` metas (light `#fafbfd`, dark
  `#000000` — the `--background` tokens), the `apple-mobile-web-app-*` metas,
  tab favicons (`favicon.ico`, `favicon-32x32.png`), and the
  `apple-touch-icon` link. iOS installers need the PNG apple-touch asset;
  browsers that still request `/favicon.ico` by default get a real icon
  file instead of the SPA HTML fallback.
- The same document owns the canonical production URL plus Open Graph and
  Twitter card metadata. Both surfaces use the committed 1200×600 image at
  `apps/web/public/og-image.png`, published as
  `https://opentrip.im/og-image.png`.
- The manifest (inline in `vite.config.ts`) lists the PNG PWA icons;
  `theme_color`/`background_color` match the app background so the install
  splash blends into the UI.
- Regenerate derived icons after replacing `app-icon-master.png` with
  `pnpm --filter @opentrip/web icons:generate`
  (`apps/web/scripts/generate-pwa-icons.mjs`, `sharp`) and commit the
  output (favicon, apple-touch, and PWA PNGs).

## Navigations and update safety

The service worker registers a `NavigationRoute` bound to the precached
`index.html`, so every SPA navigation is served from the precache (API
routes are denylisted). This keeps the HTML and the hashed assets it
references from the **same build**: without it, a navigation right after an
in-app update could pick up a stale HTML response from the browser or CDN
cache whose hashed assets the new deploy already purged — the page then
loads unstyled or not at all. It also makes offline navigation to any route
work from the precached shell.

## Serving headers

`apps/web/public/_headers` (Cloudflare Pages) marks everything unhashed —
including HTML — as `no-cache` so a deploy is picked up promptly and stale
`index.html` can never pin purged assets; hashed `/assets/*` stay immutable
and `/fonts/*` get a medium-lived cache. See
[../operations/cloudflare.md](../operations/cloudflare.md).

## Conventions

- Interactive elements keep a ≥ 40×40px hit area (`h-10`/`size-10` or
  larger); the bottom navigation items are full-column targets.
- Hover-only affordances stay behind `@media (hover: hover) and
  (pointer: fine)`; sheet motion uses the shared duration/easing tokens and
  respects `prefers-reduced-motion`.
- Mobile-only copy lives in the locale namespaces like everything else
  (e.g. `planner:nav.label`); no literal strings.
