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
`avatar`, `spinner`, `autocomplete`, `select`, `context-menu`, `tooltip`. Each exposes a
public `index.ts`.
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

### Motion utilities

CSS utilities in `apps/web/src/app/styles/global.css`:

- `wf-enter` — one-shot enter (opacity + `translateY(6px)`, 0.32s).
- `wf-enter-stagger` — parent that steps child `.wf-enter` delays by
  `--enter-stagger` (~90ms). For longer lists, set per-item
  `style={{ animationDelay: \`${index * 90}ms\` }}` instead.
- `wf-exit` — subtle exit (opacity + `translateY(-12px)` + blur, 0.2s). Pair
  with `usePresence` so the element stays mounted until the animation finishes.
- `wf-icon-swap` — cross-fade two children (scale 0.25, blur 4px). Toggle with
  `data-state="active"` or `:hover`.

Shared helpers in `apps/web/src/shared/lib`:

- `popupMotionClasses` — Base UI popup enter/exit (`data-starting-style` /
  `data-ending-style`). Used by `select`, `autocomplete`, `context-menu`, and
  `tooltip` popups.
- `usePresence(visible, durationMs?)` — delays unmount for `wf-exit`; skips
  delay when `prefers-reduced-motion` is set.
- `useEnterOnUpdate(dep)` — returns `true` when `dep` changes after the first
  render. Gate `wf-enter` on route/tab/panel swaps; do not use on first paint.

Rules:

- CSS transitions for interactive open/close (popups, collapsible panels).
- Keyframe utilities (`wf-enter`, `wf-exit`) for one-shot mount/unmount sequences.
- Enter duration > exit duration; exits use a small fixed `translateY`, not full height.
- Skip enter animations on initial page load (auth gate, first tab, first route).

## Accessibility

- Every interactive control is reachable and labeled; icons that are decorative
  use `aria-hidden`.
- Color is never the only signal (status badges pair color with text).
- Respect `prefers-reduced-motion`: staggered enters degrade to the base state.
