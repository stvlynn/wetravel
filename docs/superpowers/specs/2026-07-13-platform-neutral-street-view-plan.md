# Platform-neutral street-view implementation plan

1. Add the domain port, normalized image/preview contracts, application service,
   and a Mapillary Graph API adapter selected by runtime configuration.
2. Add authenticated trip-scoped search, detail, preview, and viewer-config HTTP
   endpoints without exposing provider data through agent-facing contracts.
3. Register `streetViewSearch` and `streetViewInspect` AI SDK tools. Return
   explicit search outcomes; use async `toModelOutput` on search for trusted
   captions plus at most one bounded ordinary static preview, and on inspect for
   an optional second static look. Reject panorama bytes before preview reads.
4. Add the approval-gated `appendStopNote` trip operation and aggregate method,
   preserving the complete existing note.
5. Extend the json-render catalog, sanitizer, and renderer with a trusted
   `StreetViewCard` and `openStreetView` action.
6. Add a page-scoped shared street-view dialog and isolated MapillaryJS viewer,
   then connect both generated replies and the map context menu.
7. Update configuration examples and architecture/user-facing documentation;
   add focused unit, HTTP, and UI tests; run type checks and relevant test suites.
8. Query bounded panorama and general candidate lanes in the provider, merge by
   id, then filter, rank, and truncate deterministically in the application.
# Superseded

This historical plan was replaced by the deterministic application-layer
grounding flow in `docs/backend/street-view.md`. Street view is no longer an AI
SDK model tool.
