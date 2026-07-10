# Route index


Full inventory relative to `createApp` in `app.ts`. Paths are absolute from the
API origin. **Auth**: `public` | `session` | `session + member` | `session + edit` | `session + canInvite`.

### Platform

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET, POST | `/api/auth/*` | Better Auth | Sign-in, sign-up, session, OAuth, etc. |
| GET | `/api/mobile-auth/oauth/start` | public | 302 to Google with OAuth state cookies |
| GET | `/api/mobile-auth/oauth/complete` | OAuth cookie | Redirect to the app with a one-time code |
| POST | `/api/mobile-auth/oauth/exchange` | one-time code | Exchange code for a native Bearer session |
| GET | `/api/health` | public | Liveness `{ status: "ok" }` |
| GET | `/api/uploads/*` | public | Immutable managed file bytes |
| GET | `/api/weather` | session | Forecast/observed weather |
| GET | `/api/fx/rates` | session | FX rate table for settle-up display |
| GET | `/api/agent/status` | session | Whether trip agent is enabled |

### Trips

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/trips` | session | List trip summaries for the current user |
| POST | `/api/trips` | session | Create trip (caller becomes owner) |
| GET | `/api/trips/:id` | session + member | Full trip DTO |
| PATCH | `/api/trips/:id` | session + edit | Rename trip |

### Itinerary days

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/trips/:id/days` | session + edit | Append empty day |
| PATCH | `/api/trips/:id/days/:day` | session + edit | Update day metadata (`:day` = day number) |
| PUT | `/api/trips/:id/days/order` | session + edit | Reorder days |
| DELETE | `/api/trips/:id/days/:day` | session + edit | Delete a day (renumbers remaining) |

### Stops

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/trips/:id/stops` | session + edit | Insert stop |
| PATCH | `/api/trips/:id/stops/:stopId` | session + edit | Update stop display metadata |
| PUT | `/api/trips/:id/stops/:stopId/position` | session + edit | Move stop to day/index |
| POST | `/api/trips/:id/stops/:stopId/vote` | session + edit | Toggle current-user vote (viewers `403`) |
| POST | `/api/trips/:id/stops/:stopId/comments` | session + edit | Add comment (viewers `403`) |
| POST | `/api/trips/:id/media` | session + edit | Upload stop-note image (multipart) |

### Expenses

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/trips/:id/expenses` | session + edit | Add expense |
| PATCH | `/api/trips/:id/expenses/:expenseId` | session + edit | Replace expense fields |

### Invites

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/trips/:id/invites` | session + canInvite | Create or regenerate invite link |
| GET | `/api/trip-invites/:token` | public | Invite preview |
| POST | `/api/trip-invites/:token/accept` | session | Accept invite (join trip) |

### User

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/users/preferences` | session | UI preferences |
| PUT | `/api/users/preferences` | session | Planner sidebar prefs |
| PUT | `/api/users/preferences/agent-panel` | session | Agent panel collapsed |
| POST | `/api/users/avatar` | session | Upload avatar (multipart) |
| DELETE | `/api/users/avatar` | session | Remove managed avatar |

### Agent (per trip)

All agent trip routes return **`404` `agent_disabled`** when AI is not
configured. Membership rules still apply when the agent is enabled.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/trips/:tripId/agent/messages` | session + member | Shared history |
| POST | `/api/trips/:tripId/agent/messages` | session + member | Post plain message |
| POST | `/api/trips/:tripId/agent/chat` | session + member | Stream agent reply |
| GET | `/api/trips/:tripId/agent/events` | session + member | Poll after cursor |
| POST | `/api/trips/:tripId/agent/suggestions/:suggestionId/approve` | session + member | Approve/deny suggestion |
| POST | `/api/trips/:tripId/agent/suggestions/:suggestionId/apply` | session + edit | Alias approve `true` |
| POST | `/api/trips/:tripId/agent/suggestions/:suggestionId/dismiss` | session + member | Alias approve `false` |

---

[← API index](./README.md) · [Platform](./platform.md) · [Trips](./trips.md) · [Itinerary](./itinerary.md) · [Expenses](./expenses.md) · [Invites](./invites.md) · [User](./user.md) · [Agent](./agent-endpoints.md)
