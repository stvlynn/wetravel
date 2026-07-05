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
`dialog`. Each exposes a
public `index.ts`.

Application icons come from `lucide-react`; feature and widget code does not
duplicate handwritten SVG paths. Decorative icons are hidden from assistive
technology while icon-only controls retain localized labels.
Variants/sizes come from props, not ad-hoc overrides. Icon-only buttons require
`aria-label`; form controls set an explicit `type`.

Stop notes are authored in a `textarea` (Markdown) and rendered in the stop
detail via `react-markdown` (scoped `.wf-markdown` typography in `global.css`),
which supports embedded images through standard Markdown image syntax.

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
