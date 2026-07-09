# Product overview

OpenTrip is a collaborative travel planning SaaS. A small group plans a trip
together — arranging stops on a map and schedule, discussing and voting on
what to keep, and splitting shared expenses fairly.

## Core user flows

1. **Browse trips** — a home grid of trips with status (active, planning,
   settled), dates, member avatars, and totals.
2. **Plan the itinerary** — inside a trip, switch between:
   - **Map** — see stops as numbered markers and per-day routes; click a stop
     to focus it and read its details, votes, and comments.
   - **Schedule** — a per-day board of stop cards; insert new stops inline.
   - **Budget** — record expenses, see per-member balances, and get the
     minimal set of transfers that settles the trip.
3. **Collaborate** — vote for stops, comment on them, and invite members.

## MVP scope

- Trips home (read) and a fully interactive single-trip planner.
- Stops: list/group by day, detail panel, vote toggle, comments, inline insert.
- Budget: expense list, add expense with payer + split, balances, settlement.
- Email + password authentication (Better Auth).

## Prototype fidelity

We recreate the `Travel Planner.dc.html` visual design with cossUI. The exact
seed data (members, days, 22 stops, 8 expenses) is preserved as demo content.
See [handoff-implementation.md](handoff-implementation.md).

## Non-goals (for this iteration)

- Real-time multiplayer sync (presence dots are cosmetic).
- Trip editing wizard beyond creating a named, empty trip (dates and cover are
  not yet wired).
- Email delivery (verification/reset emails and invite emails are not wired to a
  provider; invites are shared as links). Members join via an invite link with a
  configurable access scope, role, can-invite flag, and custom expiry.
- Multi-currency conversion for expense storage and balances (amounts remain in
  the trip currency; settle-up can *display* transfers in another currency via
  the FX proxy — see [../backend/fx.md](../backend/fx.md)).
