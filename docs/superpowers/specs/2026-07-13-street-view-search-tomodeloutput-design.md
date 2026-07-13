# Street-view search `toModelOutput` (C1)

**Status:** Approved for implementation on 2026-07-13  
**Parent:** [platform-neutral-street-view-design.md](./2026-07-13-platform-neutral-street-view-design.md)

## Goal

Keep `StreetViewCard` as model-emitted json-render UI, but make a successful
`streetViewSearch` feed the model **trusted captions plus at most one static
preview** in the same tool turn via AI SDK `toModelOutput`. The model should no
longer invent Mapillary prose and then fail to emit a grounded card.

## Non-goals

- Frontend rendering of cards from tool parts (approach A).
- Server auto-injection of `data-spec` (approach B).
- Merging search and inspect into a new tool (approach C3).
- Supplying panorama bytes to the model.
- Persisting preview bytes or base64 in `agent_messages`.

## Design

### Persistence vs model view

| Path | Content |
| --- | --- |
| `execute` | Unchanged compact `StreetViewSearchResultDto` JSON (no bytes, no provider URLs). |
| `toModelOutput` | Text captions from DTO fields + optional one static preview file for the current model step only. |
| Grounding | Unchanged: `StreetViewCard.imageId` must appear in the same assistant message's successful street-view tool output. |

### Caption rules

Captions are application-assembled English machine text from trusted fields
only: `id`, `distanceMeters`, `headingDegrees`, `capturedAt`, `supports360`,
`attribution.label`. They must not invent landmarks (“pointing at Glico”) or
localized marketing copy. The model may still set `StreetViewCard.placeLabel`
from the trip snapshot or geo tools.

### Preview attachment

When `outcome=found`:

1. Prefer the first ranked image with `supports360=false`.
2. Read preview through the existing cache/provider path (2 MiB, timeout).
3. On preview failure, return caption text only and note that the preview was
   unavailable; do not fail the search tool.
4. When every result is a panorama, return captions only (no vision bytes);
   the member uses `openStreetView` on a grounded card.

When `outcome=empty`, return caption text describing empty/partial semantics
only.

### Prompt

Chat and catalog rules instruct: after a successful `found` search, emit
`StreetViewCard` with one returned `imageId` in the same reply; do not replace
the card with a metadata caption; do not claim imagery was found without a tool
result in this turn. `streetViewInspect` remains available for an optional
second look at another static id already returned by search.

### Observability

Log whether search `toModelOutput` attached a preview (`attached` /
`skipped_panorama_only` / `skipped_empty` / `preview_unavailable`) with
`tripId` and image id when present. Never log tokens, bytes, or provider URLs.

## Test plan

- Unit: search `toModelOutput` attaches text + file for a static hit.
- Unit: panorama-only found → text only.
- Unit: empty → text only; preview read failure → text with unavailable note.
- Existing inspect and grounding sanitizer tests remain green.
- Docs: `docs/backend/street-view.md`, `docs/backend/agent.md`.
