# Trip operations registry

Single source of truth for **trip-scoped editor mutations** shared by:

- HTTP request validation (`apps/api/src/interfaces/http/app.ts`)
- Agent write tools + AI SDK `toolApproval` (`agent-model.ai-sdk.ts`)
- Proactive `pendingPatch` schema (`generateObject`)
- Apply path after human approval (`applyTripOp`)

## Location

```
apps/api/src/application/trip/ops/
  schemas.ts   # shared Zod
  catalog.ts   # TRIP_OPS registry
  apply.ts     # applyTripOp
  index.ts     # public exports
```

Domain aggregate methods stay in `domain/trip/trip.ts`. The registry only
**orchestrates** those methods + `TripRepository` persistence. It does **not**
import the Vercel AI SDK (`tool()` lives in infrastructure).

## How to add a new trip CRUD op

1. **Domain** — Add or extend a `Trip` method (+ repository method if needed).
2. **Registry** — Append one entry to `TRIP_OPS` in `catalog.ts`:
   - `kind` (snake_case, stored in `agent_suggestions.patch`)
   - `toolName` (camelCase for the model)
   - `description`, `inputSchema`, `patchSchema`
   - `toPatch`, `apply`
   - `needsApproval: true`, `allowProactive` as appropriate
3. **Schemas** — Add Zod in `schemas.ts` if not already shared with HTTP.
4. **HTTP** — Wire a route that parses the shared schema (if user-facing).
5. **Do not** edit hand-written tool lists in `agent-model.ai-sdk.ts` — tools
   and approval maps are generated from `listWriteOps()`.

## Not in this registry

- `checkWeather` (read-only agent tool)
- Invites, votes, stop comments
- Ops the product domain does not support yet (e.g. delete stop / expense)

## Approval

All write ops use AI SDK `toolApproval: 'user-approval'` (viewers denied).
See [agent.md](./agent.md) and [../decisions/0005-trip-agent.md](../decisions/0005-trip-agent.md).
