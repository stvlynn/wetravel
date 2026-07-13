# UI system (cossUI)

Reference: [../reference/frontend-sources.md](../reference/frontend-sources.md)
and [../reference/handoff.md](../reference/handoff.md).

## Tokens

The cossUI token CSS is ported from the handoff into
`apps/web/src/app/styles/tokens`:

- `colors.css` — `--ink-*` (cool blue-grey) and `--corn-*` (cornflower) ramps
  plus semantic aliases (`--background`, `--foreground`, `--card`, `--primary`,
  `--brand`, `--muted`, `--border`, status colors) and a `.dark` scope.
- `spacing.css` — radius scale (base 10px, card `2xl`), spacing steps,
  elevation shadows, top-highlight, shadow-as-border, focus-ring, and motion
  tokens (`--press-scale: 0.96`, `--ease-out`, `--enter-stagger`).
- `typography.css` — font stacks and type scale.
- `fonts.css` — `@font-face` for Cal Sans, Cal Sans UI, Paper Mono.

Font variable contract: `--font-sans`, `--font-heading`, `--font-mono`. Use
semantic tokens, never raw palette values.

## Primitives

Implemented in `apps/web/src/shared/ui`, matching cossUI APIs:

`button`, `badge`, `input`, `textarea`, `checkbox`, `tabs`, `card` (+ parts),
`avatar`, `spinner`, `autocomplete`, `select`, `context-menu`, `tooltip`,
`popover`, `preview-card`, `dialog`, `drawer`, `collapsible`, `splitter`,
`scroll-edge-fade`, `markdown-editor`, `otp-field`. Each exposes a public
`index.ts`.

`otp-field` is the segmented one-time-code input (Base UI OTP Field) used by
email registration verification in `AuthForm`.

`drawer` is the mobile sheet surface (Base UI Dialog): `DrawerContent
side="bottom"` for bottom sheets, `side="full"` for full-screen surfaces, both
safe-area padded. For dialogs that exist on both form factors, use
`DialogSheetViewport` + `DialogSheetPopup` from `dialog` — a bottom sheet below
the `md` breakpoint, a centered card above. See [mobile-pwa.md](mobile-pwa.md).

`preview-card` is a hover/focus-triggered rich card (Base UI PreviewCard). Use
it, rather than `tooltip`, when the hover content is structured (e.g. the
settle-up transfer breakdown in the budget board) instead of a short hint.

`splitter` implements the WAI-ARIA APG Window Splitter pattern: a focusable
separator with `aria-valuenow/min/max`, `aria-controls`, keyboard arrow-key
resizing, `Enter` to collapse/restore, and `Home`/`End` to jump to extremes.

`scroll-edge-fade` wraps an overflowing strip (horizontal or vertical) with
CSS `mask-image` edge fades. Mask width appears only on overflowing ends
(ease-out). Optional circular chevron page controls (`showControls`, default
on) page by roughly one viewport with the shared ease-out curve — turn them
off for free-scroll lists that only need fades. Used by DayPills (horizontal
+ controls) and the planner Sidebar stop list (vertical, fades only).

Application icons come from `lucide-react`; feature and widget code does not
duplicate handwritten SVG paths. Decorative icons are hidden from assistive
technology while icon-only controls retain localized labels.
Variants/sizes come from props, not ad-hoc overrides. Icon-only buttons require
`aria-label`; form controls set an explicit `type`.

Stop notes expand into the planner main pane (replacing map/schedule/budget)
via a Milkdown Crepe WYSIWYG editor (Crepe TopBar as fixed chrome, block slash
menu). Images upload through `POST /api/trips/:id/media` into the shared
object-storage port (same FS/S3 adapters as avatars) and embed as hosted URLs
in Markdown. Closing asks to save or discard when the draft is dirty. The
sidebar keeps a Markdown preview (`react-markdown` + `.wf-markdown`); click
or the expand control opens the main-pane editor. Agent chat assistant replies
use Streamdown (same `.wf-markdown` scope) so incomplete streaming Markdown
stays readable without a hand-rolled parser.

`autocomplete` and `select` are adapted from the coss components and built on
Base UI (`@base-ui/react`). `autocomplete` powers the stop-name place search
(async, relevance-sorted suggestions; use `mode="none"` with controlled
`value`/`items` for server-driven results, and read the selected item on the
`item-press` change reason). `select` provides the schedule time and date
pickers (predefined options via the `items`-first pattern). `context-menu`
powers the map's right-click actions (add a stop at the clicked point, copy
coordinates).

## Interaction polish

From make-interfaces-feel-better, applied consistently:

- Root: `-webkit-font-smoothing: antialiased`.
- Headings `text-wrap: balance`; body/caption `text-wrap: pretty`.
- All dynamic numbers (money, time, counts) use `tabular-nums`.
- Transitions specify exact properties — never `transition: all`.
- Pressable controls use `active:scale-[0.96]`.
- Small icon buttons keep a >= 40x40 hit area.
- Concentric radius on nested surfaces; shadows over hard borders for elevated
  surfaces.
- No focus glow/ring: the default focus outline is removed app-wide in
  `global.css`, and interactive surfaces convey focus through hover, border, and
  background changes (matching the Input/Autocomplete treatment).

## Motion

Motion has a single source of truth so effects are never re-implemented per
component (derived from Emil Kowalski's craft bar; see the `review-animations`
skill).

- **Tokens** (`tokens/spacing.css`): `--press-scale`, `--ease-out` (the one UI
  easing curve), and durations `--dur-fast` (120ms), `--dur-base` (150ms),
  `--dur-slow` (200ms), `--dur-icon` (300ms). UI motion stays under 300ms; the
  icon cross-fade is the only 300ms exception. Never hardcode milliseconds or a
  raw `cubic-bezier`.
- **Utilities** (`global.css`, referenced via `shared/lib` identifiers):
  `pressable` (`.wf-pressable`) for press-scale only, `interactive`
  (`.wf-interactive`) for background/color feedback + press, and `field`
  (`.wf-field`) for input border/background. These replace the repeated
  `transition-[...] active:scale-[0.96]` strings.
- **Icon cross-fade**: use the `IconSwap` primitive (`shared/ui/icon-swap`), the
  single implementation of opacity/scale/blur glyph swapping (`.wf-icon-swap`).
  State-driven by default; pass `hoverSwap` for hover reveals (gated to fine
  pointers).
- **List entrance**: put `.wf-enter-stagger` on the parent and `.wf-enter` on
  children; the stagger step is `--enter-stagger` (60ms). Children never
  hardcode `animationDelay`.
- **Scroll edge fade**: use `ScrollEdgeFade` (`shared/ui/scroll-edge-fade`) for
  overflowing strips — CSS `mask-image` edge fades (`.wf-scroll-edge-fade`) +
  circular page controls with ease-out enter/exit and ease-out page scrolling.
  Do not re-implement per feature.
- **Popovers** (Select, ContextMenu, Autocomplete, Tooltip, Dialog) scale from
  their trigger via `origin-(--transform-origin)` and Base UI
  `data-starting-style`/`data-ending-style`; only modals stay centered.
- **GPU-only**: animate `transform`/`opacity` — `box-shadow` is never placed in
  a `transition`.

## Accessibility

- Every interactive control is reachable and labeled; icons that are decorative
  use `aria-hidden`.
- Color is never the only signal (status badges pair color with text).
- Respect `prefers-reduced-motion`: movement (transform/translate) is dropped
  while opacity/color transitions are kept — gentler, not zero. Hover-driven
  motion is gated behind `@media (hover: hover) and (pointer: fine)` so touch
  taps never fire false hover animations.
