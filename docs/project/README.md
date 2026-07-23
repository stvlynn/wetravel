# Product overview

OpenTrip is a collaborative travel planning SaaS. A small group plans a trip
together — arranging stops on a map and schedule, discussing and voting on
what to keep, and splitting shared expenses fairly.

## Core user flows

1. **Browse trips** — a home grid of trips with status (active, planning,
   settled), dates, member avatars, totals, and place-based map thumbnails.
2. **Plan the itinerary** — inside a trip, switch between:
   - **Map** — see stops as numbered markers and per-day routes; click a stop
     to focus it and read its details, votes, and comments.
   - **Schedule** — a per-day board of stop cards; insert new stops inline.
   - **Budget** — record expenses, see per-member balances, and get the
     minimal set of transfers that settles the trip.
3. **Collaborate** — vote for stops, comment on them, and invite members.
4. **Write travelogues** — capture a moment on mobile, group entries by their
   linked journey (or leave them unlinked), then read, edit, or revisit them in
   an editorial article view with draft and published filters. The current
   frontend preview supports draft/published workflow and a
   mobile-friendly WYSIWYG Markdown editor. The editor supports H1–H5 and a
   `/map` travel block that renders the linked trip as a compact map widget.
   Images and supported attachments use trip media storage when an entry is linked to a trip; article content,
   publication state, account sync, sharing permissions, and model-backed
   article Q&A remain backend follow-ups.
5. **Use Today between journeys** — set a current city or region to see local
   weather, capture a moment, prepare an upcoming trip, or reflect on one that
   ended recently.

## MVP scope

- Trips home (read) and a fully interactive single-trip planner.
- Guided create-trip wizard (destination, days, dates, budget, party — each
  optional / TBD), Unsplash cover when a destination is set, then navigate to
  the planner with a one-shot suggested `@agent` draft on first open; the member
  reviews or edits it before explicitly sending.
- Stops: list/group by day, detail panel, vote toggle, comments, inline insert.
- Budget: expense list, add expense with payer + split, balances, settlement.
- Email + password authentication (Better Auth).

## Prototype fidelity

We recreate the `Travel Planner.dc.html` visual design with cossUI. The exact
seed data (members, days, 22 stops, 8 expenses) is preserved as demo content.
See [handoff-implementation.md](handoff-implementation.md).

## Non-goals (for this iteration)

- Real-time multiplayer sync (presence dots are cosmetic).
- Email delivery (verification/reset emails and invite emails are not wired to a
  provider; invites are shared as links). Members join via an invite link with a
  configurable access scope, role, can-invite flag, and custom expiry.
- Multi-currency conversion for expense storage and balances (amounts remain in
  the trip currency; balances and settle-up can *display* amounts in another
  currency via the FX proxy — see [../backend/fx.md](../backend/fx.md)).
- Downloading Unsplash images into trip media storage (covers use CDN URLs).
- Pre-creating members from party size or expenses from planned budget.
