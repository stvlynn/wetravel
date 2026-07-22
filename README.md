<p align="center">
  <img src="docs/assets/logo.png" width="96" height="96" alt="OpenTrip logo" />
</p>

<h1 align="center">OpenTrip</h1>

<p align="center">
  <strong>Plan trips together. Split everything.</strong>
</p>

<p align="center">
  Collaborative travel planning for small groups — map itineraries, day schedules,
  shared expenses, reservations, and an AI trip companion in one place.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="#features">Features</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#tech-stack">Tech stack</a>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img alt="Hono" src="https://img.shields.io/badge/Hono-API-E36002?logo=hono&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-ready-4169E1?logo=postgresql&logoColor=white" />
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white" />
  <img alt="i18n" src="https://img.shields.io/badge/i18n-EN%20%7C%20中文-green" />
</p>

<p align="center">
  <img src="docs/assets/screenshots/pc-map.jpg" alt="OpenTrip desktop map view — Japan Autumn trip" width="920" />
</p>

---

## Why OpenTrip?

Group travel planning is usually a mess of group chats, spreadsheets, and half-updated maps. OpenTrip keeps the whole trip in one shared workspace:

- **See the route** — stops on a live map with day filters, weather, and place search
- **Own the day** — a schedule board per day so timing and transit stay clear
- **Spend fairly** — expenses, balances, and minimal settle-up transfers
- **Decide together** — votes, comments, and invites for the whole crew
- **Ask the agent** — a trip-aware AI companion when you need a second opinion

The seed demo is **Japan · Autumn** — Tokyo → Kyoto → Osaka, 5 days, 25 stops, and a full expense ledger ready to explore the moment you sign in.

---

## Features

| Capability | What you get |
| --- | --- |
| **Map itinerary** | Numbered stop markers, per-day routes, place search, stop detail with votes & comments |
| **Schedule board** | Day columns, inline stop cards, transit segments, weather hints |
| **Budget & settle-up** | Shared expenses, per-member balances, minimal repayment graph, multi-currency display |
| **Reservations** | Track bookings and confirmations alongside the itinerary |
| **Trip agent** | Shared AI chat per trip — ask about the plan, get suggestions, apply changes with approval |
| **Collaboration** | Invite links, member roles, stop voting, threaded comments |
| **Desktop + PWA** | Full desktop planner and a mobile-first PWA (installable; WeChat mini-program shell available) |
| **i18n** | English and 中文, switchable at any time |

---

## Screenshots

Planner shots use the **Japan · Autumn** demo. The trips home also shows other demo trips (Iceland, Lisbon, Bali) with Unsplash covers.

### Trips home

Browse active trips, cover photos, members, and status at a glance.

| Desktop | PWA |
| :---: | :---: |
| <img src="docs/assets/screenshots/pc-trips.jpg" alt="Desktop trips home" width="480" /> | <img src="docs/assets/screenshots/pwa-trips.jpg" alt="PWA trips home" width="240" /> |

### Map itinerary

Plan the route on a map — filter by day, open a stop, search places.

| Desktop | PWA |
| :---: | :---: |
| <img src="docs/assets/screenshots/pc-map.jpg" alt="Desktop map itinerary" width="480" /> | <img src="docs/assets/screenshots/pwa-map.jpg" alt="PWA map itinerary" width="240" /> |

### Schedule

Day-by-day board of sights, food, transit, and stays.

| Desktop | PWA |
| :---: | :---: |
| <img src="docs/assets/screenshots/pc-schedule.jpg" alt="Desktop schedule board" width="480" /> | <img src="docs/assets/screenshots/pwa-schedule.jpg" alt="PWA schedule board" width="240" /> |

### Budget & settle-up

Log who paid what — OpenTrip computes balances and the fewest transfers to settle.

| Desktop | PWA |
| :---: | :---: |
| <img src="docs/assets/screenshots/pc-budget.jpg" alt="Desktop budget and settle-up" width="480" /> | <img src="docs/assets/screenshots/pwa-budget.jpg" alt="PWA budget and settle-up" width="240" /> |

### Stop detail & collaboration

Votes, comments, costs, and weather on every stop.

<p align="center">
  <img src="docs/assets/screenshots/pc-stop-detail.jpg" alt="Desktop stop detail with votes and comments" width="720" />
</p>

### Trip agent

A shared AI companion for the trip — ask in chat, review suggestions, approve writes.

| Desktop | PWA |
| :---: | :---: |
| <img src="docs/assets/screenshots/pc-agent.jpg" alt="Desktop trip agent drawer" width="480" /> | <img src="docs/assets/screenshots/pwa-agent.jpg" alt="PWA trip agent sheet" width="240" /> |

### Reservations

Keep bookings next to the plan so nothing falls through the cracks.

| Desktop | PWA |
| :---: | :---: |
| <img src="docs/assets/screenshots/pc-reservations.jpg" alt="Desktop reservations" width="480" /> | <img src="docs/assets/screenshots/pwa-reservations.jpg" alt="PWA reservations" width="240" /> |

---

## Tech stack

| Layer | Stack |
| --- | --- |
| **Web** | React 19 · TypeScript · Vite · Feature-Sliced Design · Tailwind · MapLibre |
| **API** | Hono · Domain-Driven Design + Hexagonal architecture · Better Auth |
| **Data** | PostgreSQL · Prisma Migrate |
| **AI** | Vercel AI SDK · trip-scoped tools with human approval |
| **Runtime** | Cloudflare (Pages + Workers + Hyperdrive) or Docker Compose |
| **Clients** | Responsive SPA + PWA · WeChat mini-program WebView shell |

---

## Quick start

**Requirements:** Node.js ≥ 20, [pnpm](https://pnpm.io), Docker (for local Postgres).

```bash
# 1. Install & env
make setup          # pnpm install, .env, Postgres, migrate, seed

# 2. Develop
make dev            # web → http://localhost:5170  ·  api → http://localhost:8780
```

Create an account in the UI. A seeded **Japan · Autumn** trip is available so you can explore the full planner immediately.

```bash
# Useful commands
make db-seed        # re-seed demo trip data
make check          # typecheck + lint + test + build
make deploy         # deployment pointers (Cloudflare / Docker)
```

---

## Project layout

```
apps/
  web/          React SPA + PWA
  api/          Hono API (DDD / Hexagonal)
  miniapp/      WeChat native shell (hosts the PWA)
packages/       Shared libraries (agent UI catalog, observability)
deploy/         Cloudflare + Docker deploy configs
docs/           Architecture & operations notes
```

---

## Contributing

Issues and pull requests are welcome. Please:

1. Keep code, comments, and commit messages in **English**
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) — e.g. `feat(budget): add multi-currency settle-up display`
3. Run `make check` before opening a PR

---

## License

Licensed under the [Apache License 2.0](LICENSE).

---

<p align="center">
  Made for people who travel with friends — and want the plan to stay fair.
</p>
