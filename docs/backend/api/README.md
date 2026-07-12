# API (client contract)

HTTP contract for **web, mobile, and other clients**.

Source of truth for routes: `apps/api/src/interfaces/http/app.ts`. Request
shapes: edge Zod schemas (including `application/trip/ops/schemas.ts`).
Response DTOs: application serializers (`application/dto.ts`, agent/preferences
DTOs, invite service types, weather/FX data types).

**Mobile / multi-client start here.**

## Contents

| Doc | What it covers |
| --- | --- |
| [conventions.md](./conventions.md) | Base path, envelopes, status codes, trip access, non-JSON, amounts/dates/ids |
| [auth-session.md](./auth-session.md) | Session cookies, Better Auth surfaces for all clients |
| [routes.md](./routes.md) | Full method/path/auth route index |
| [platform.md](./platform.md) | Health, uploads, weather, FX, agent status |
| [trips.md](./trips.md) | List / create / get / rename trips |
| [itinerary.md](./itinerary.md) | Days, stops, votes, comments, media |
| [expenses.md](./expenses.md) | Add / update expenses |
| [reservations.md](./reservations.md) | Booking lifecycle and optimistic concurrency |
| [invites.md](./invites.md) | Create, preview, accept invites |
| [user.md](./user.md) | Preferences and avatar |
| [agent-endpoints.md](./agent-endpoints.md) | Agent messages, chat stream, events, suggestions |
| [dtos.md](./dtos.md) | Response/request DTO field catalog |
| [errors.md](./errors.md) | Error envelope and code mapping |
| [multi-client.md](./multi-client.md) | Practical notes for native / multi-client apps |

## Related backend docs

- [auth.md](../auth.md) — Better Auth, captcha, OAuth, session env
- [domain.md](../domain.md) — aggregate rules
- [trip-ops.md](../trip-ops.md) — mutation registry shared with agent tools
- [agent.md](../agent.md) — session, tools, proactive suggestions
- [weather.md](../weather.md) · [fx.md](../fx.md) · [geo.md](../geo.md) · [lodging.md](../lodging.md)
- [database.md](../database.md) — persistence
- Web API wrappers (usage hints only): `apps/web/src/shared/api/`
