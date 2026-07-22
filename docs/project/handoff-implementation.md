# Handoff implementation mapping

Maps `Travel Planner.dc.html` (see [../reference/handoff.md](../reference/handoff.md))
onto the real implementation. The prototype's `dc-runtime` template engine and
`CossUIDesignSystem_2babcc` global are not carried over; components are rebuilt
as real cossUI React primitives.

## Views

| Prototype | Implementation |
| --- | --- |
| `view: "trips"` | `apps/web/src/pages/trips` |
| `view: "planner"` | `apps/web/src/pages/travel-planner` |
| Sidebar itinerary + detail | `TravelPlanner` page-private widgets |
| Map tab (`trip-map.js`) | `apps/web/src/shared/ui/map` + `TripMapView` |
| Schedule tab | `ScheduleBoard` widget |
| Budget tab | `BudgetBoard` widget |
| Floating members / invite | `FloatingMembers` widget |

## Components

| Prototype `x-import` | cossUI primitive |
| --- | --- |
| `Button` | `shared/ui/button` |
| `Badge` | `shared/ui/badge` |
| `Input` | `shared/ui/input` |
| `Checkbox` | `shared/ui/checkbox` |
| `Tabs` | `shared/ui/tabs` |
| `Card` (+ parts) | `shared/ui/card` |
| avatar spans | `shared/ui/avatar` |

## Behavior: persisted vs demo

| Behavior | Status |
| --- | --- |
| Read trips, stops, expenses | Persisted (API + PostgreSQL) |
| Vote toggle | Persisted (current user) |
| Add comment | Persisted |
| Insert stop | Persisted |
| Reorder days (drag a day column) | Persisted (renumbers days, remaps stops; optimistic on the client) |
| Add expense | Persisted |
| Balances + settlement | Computed server-side from persisted expenses |
| Member presence dots | Demo (cosmetic, from seed) |
| Invite | Persisted (configurable invite links with access scope, role, can-invite, and custom expiry; accepting adds a real member) |
| Trip creation ("New trip") | Persisted (creates a planning trip owned by the current user as its first member) |
| Travelogue editor | Frontend preview (WYSIWYG Markdown, pasted images, PDF/Markdown/TXT/CSV attachments) |
| Travelogue draft/published state | Local browser state (not account-synced or shared yet) |
| Travelogue media | Persisted through the linked trip media namespace |

## Data parity

Seed data reproduces the prototype exactly: 4 members (`lynn` is the current
demo user), 5 days, 22 stops (with `transit` flags on the two inter-city legs),
and 8 expenses. Money is JPY, formatted `¥` + grouped integer, matching the
prototype's `yen()` helper. Settlement uses the same greedy debtor/creditor
match. See [../backend/domain.md](../backend/domain.md).
