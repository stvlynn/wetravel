# Mobile adaptation and PWA install

How the SPA adapts to narrow viewports and installs as a PWA. The service
worker and runtime caching strategy are configured in `apps/web/vite.config.ts`
(vite-plugin-pwa, `injectManifest`) with the worker source at
`apps/web/src/sw.ts` and lifecycle toasts in
`apps/web/src/app/providers/PwaLifecycle.tsx`.

## Breakpoint contract

One breakpoint separates the mobile and desktop layouts: Tailwind `md`
(768px). CSS uses `md:` / `max-md:` variants; JS uses `useIsMobile()` from
`@/shared/lib`, whose `MOBILE_MEDIA_QUERY` is `(max-width: 767.9px)` so the
JS branch and CSS variants never disagree at exactly 768px. Do not introduce
additional layout-switching breakpoints; finer grid tuning (e.g. `lg:`
columns) is fine.

## Planner mobile shell

`TravelPlannerPage` renders one of two shells around the same state and the
same always-mounted mode panes:

- **Desktop** — the splitter layout: itinerary `AppSidebar`, main panel with
  icon tabs, `AgentDrawer` side panel.
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

## Safe areas

`index.html` sets `viewport-fit=cover`, so `env(safe-area-inset-*)` is
non-zero on notched devices in standalone mode. Pad any surface that touches
a screen edge on mobile: top bars use
`pt-[max(<fallback>,env(safe-area-inset-top))]`, bottom bars and sheet
footers use the matching `safe-area-inset-bottom` form. The Drawer primitive
and the sheet dialog footers already do this.

## Install metadata and icons

- `index.html` carries the `theme-color` metas (light `#fafbfd`, dark
  `#141a30` — the `--background` tokens), the `apple-mobile-web-app-*` metas,
  and the `apple-touch-icon` link. iOS ignores SVG manifest icons, so PNG
  icons are committed alongside the SVGs.
- The manifest (inline in `vite.config.ts`) lists PNG icons first, then SVG;
  `theme_color`/`background_color` match the app background so the install
  splash blends into the UI.
- Regenerate the PNGs after editing the SVG sources with
  `pnpm --filter @opentrip/web icons:generate`
  (`apps/web/scripts/generate-pwa-icons.mjs`, `sharp`) and commit the
  output. The apple-touch-icon is rendered opaque from the full-bleed
  maskable SVG.

## Serving headers

`apps/web/public/_headers` (Cloudflare Pages) marks `/sw.js` and
`/manifest.webmanifest` as `no-cache` so updates are picked up promptly, and
hashed `/assets/*` as immutable. See
[../operations/cloudflare.md](../operations/cloudflare.md).

## Conventions

- Interactive elements keep a ≥ 40×40px hit area (`h-10`/`size-10` or
  larger); the bottom navigation items are full-column targets.
- Hover-only affordances stay behind `@media (hover: hover) and
  (pointer: fine)`; sheet motion uses the shared duration/easing tokens and
  respects `prefers-reduced-motion`.
- Mobile-only copy lives in the locale namespaces like everything else
  (e.g. `planner:nav.label`); no literal strings.
