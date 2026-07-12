# DTO catalog

## `StopCategory`

```ts
"Sight" | "Food" | "Stay" | "Shopping" | "Activity" |
"Walk" | "Park" | "Transit" | "Plan"
```

## `TripStatus`

```ts
"active" | "planning" | "settled"
```

## `MemberRole`

```ts
"owner" | "editor" | "viewer"
```

## `TripSummary`

Returned by `GET /api/trips`.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Trip id |
| `title` | string | Title |
| `startLabel` | string | Display start label |
| `endLabel` | string | Display end label |
| `status` | `TripStatus` | Status |
| `currency` | string | Trip currency code |
| `coverColor` | string | Card color |
| `coverUrl` | string \| null | Optional Unsplash (or other) cover image URL |
| `memberCount` | number | Members |
| `stopCount` | number | Stops |
| `createdAt` | string | ISO 8601 creation time |
| `creatorName` | string | Owner / first member display name |
| `members` | `TripSummaryMember[]` | Creator-first; for avatar stack |
| `location` | `{ lat, lng } \| null` | First located stop, or null |

**`TripSummaryMember`:** `id`, `name`, `initials`, `avatarBg`, `avatarFg`,
optional `image`, `isCurrentUser`.

## `TripDto` (full trip)

Returned by most trip mutations and `GET /api/trips/:id`.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Trip id |
| `title` | string | Title |
| `status` | string (`TripStatus`) | Status |
| `currency` | string | Default trip currency |
| `startDate` | string | ISO `YYYY-MM-DD` or `""` |
| `coverUrl` | string \| null | Optional cover image URL |
| `intake` | `TripIntake` \| null | Create-wizard answers (TBD fields omitted) |
| `agentSeedPending` | boolean | Planner should send one-shot `@agent` seed |
| `members` | `MemberDto[]` | Membership |
| `permissions` | `TripPermissions` | **Caller’s** effective rights |
| `days` | `DayDto[]` | Itinerary days |
| `stops` | `StopDto[]` | Flat list (use `day` + order) |
| `expenses` | `ExpenseDto[]` | Expenses |
| `budget` | `Budget` | Server-computed settlement |

**`TripIntake`** (create wizard; omitted keys mean TBD):

| Field | Type | Meaning |
| --- | --- | --- |
| `destination` | string? | City / region label |
| `destinationLat` | number? | Geocoded destination latitude (create / backfill) |
| `destinationLng` | number? | Geocoded destination longitude |
| `dayCount` | number? | Planned day count |
| `startDate` | string? | ISO start |
| `endDate` | string? | ISO inclusive end |
| `budgetAmount` | number? | Planned budget amount |
| `budgetCurrency` | string? | Currency for `budgetAmount` |
| `partySize` | number? | Planned party size (does not create members) |

**`TripPermissions`:**

| Field | Type | Meaning |
| --- | --- | --- |
| `isMember` | boolean | May read |
| `canEdit` | boolean | Owner/editor (not viewer) |
| `canInvite` | boolean | May create invites |

**`MemberDto`:**

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Trip-local member id |
| `name` | string | Display name |
| `shortName` | string | Short label |
| `initials` | string | Avatar initials |
| `avatarBg` / `avatarFg` | string | Fallback colors |
| `image` | string \| null? | Avatar URL |
| `userId` | string \| null? | Better Auth user id; null for demo |
| `role` | `MemberRole` | Collaboration role |
| `canInvite` | boolean | Invite permission |
| `isCurrentUser` | boolean | True for the requesting user |

**`DayDto`:**

| Field | Type | Meaning |
| --- | --- | --- |
| `number` | number | 1-based day number |
| `date` | string | ISO `YYYY-MM-DD` or `""` |
| `dateLabel` | string | Legacy display label |
| `city` | string | City / region label |
| `color` | string | Hex color |

**`StopDto`** (persistence-only `order` is **not** exposed):

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stop id |
| `day` | number | Day number |
| `time` | string | Time label |
| `duration` | string | e.g. `1h` |
| `name` | string | Title |
| `area` | string | Area / neighborhood |
| `category` | string (`StopCategory`) | Category |
| `lat` / `lng` | number | Coordinates |
| `cost` | number | Per-person estimate (minor units) |
| `costCurrency` | string | ISO code; empty → trip currency |
| `createdBy` | string | Trip-local member id |
| `transit` | boolean | Transit segment flag |
| `note` | string | Markdown note |
| `votes` | string[] | Member ids who voted |
| `comments` | `{ author, timeLabel, text }[]` | Comments |

**`ExpenseDto`** (`createdOrder` not exposed):

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Expense id |
| `description` | string | Label |
| `payer` | string | Trip-local member id |
| `amount` | number | Minor units |
| `currency` | string | ISO code for amount |
| `category` | string (`StopCategory`) | Type |
| `participants` | string[] | Split among these member ids |
| `whenLabel` | string | Display time label |

## `Budget`

| Field | Type | Meaning |
| --- | --- | --- |
| `total` | number | Sum of expense amounts |
| `perPerson` | number | `total / memberCount` (rounded) |
| `balances` | `Balance[]` | Per-member paid / share / net |
| `settlements` | `Settlement[]` | Minimal transfer plan |

**`Balance`:** `{ memberId, paid, share, net }` — `net = paid − share`
(positive ⇒ others owe them).  
**`Settlement`:** `{ from, to, amount }` — transfer from debtor member id to
creditor.  
**Note:** Budget math sums numeric amounts without FX conversion; mixed
currencies are stored for display / future FX. Use `GET /api/fx/rates` only for
**display** conversion of settlements.

Example:

```json
{
  "total": 470200,
  "perPerson": 117550,
  "balances": [
    { "memberId": "lynn", "paid": 91200, "share": 117550, "net": -26350 }
  ],
  "settlements": [
    { "from": "lynn", "to": "sam", "amount": 26350 }
  ]
}
```

## `InvitePreview`

| Field | Type | Meaning |
| --- | --- | --- |
| `tripId` | string | Trip to join |
| `tripTitle` | string | Title |
| `inviterName` | string | Who invited |
| `memberCount` | number | Current members |
| `role` | `"editor" \| "viewer"` | Role on accept |
| `accessScope` | `"anyone" \| "restricted_emails"` | Link policy |
| `status` | `"usable" \| "expired" \| "revoked" \| "email_restricted"` | Usability |
| `alreadyMember` | boolean | Viewer already on trip |
| `expiresAt` | string \| null | Expiry |

## `UserPreferenceDto`

| Field | Type | Meaning |
| --- | --- | --- |
| `userId` | string | User id |
| `plannerSidebar` | `{ width: number; collapsed: boolean }` | Planner chrome |
| `agentPanelCollapsed` | boolean | Agent panel UI |
| `updatedAt` | string | ISO timestamp |

## `WeatherData`

| Field | Type | Meaning |
| --- | --- | --- |
| `icon` | string | Icon code |
| `main` | string | Short condition |
| `description` | string | Longer description |
| `temp` | number | Temperature |
| `feelsLike` | number | Feels-like |
| `humidity` | number | Humidity |
| `pressure` | number | Pressure |
| `visibility` | number | Visibility |
| `windSpeed` | number | Wind speed |
| `windDeg` | number | Wind direction deg |
| `clouds` | number | Cloud cover |

## `FxRatesData`

| Field | Type | Meaning |
| --- | --- | --- |
| `date` | string | Rate table date |
| `base` | string | Base currency |
| `provider` | string | Provider id |
| `rates` | `Record<string, number>` | Quote → units of quote per 1 base (includes `base: 1`) |
| `fetchedAt` | string | Fetch timestamp |

## Agent DTOs

### `AgentHistoryDto`

```ts
{ messages: AgentMessageDto[]; suggestions: AgentSuggestionDto[] }
```

### `AgentPostMessageResultDto`

Returned by `POST …/agent/messages` (inside `{ data }`):

```ts
{ addressed: boolean; message: AgentMessageDto }
```

`message` is the inserted row so clients can update the history cache without
an immediate list GET (Hyperdrive may serve a stale cached SELECT).

### `AgentEventsDto`

```ts
{
  latestSeq: number;
  messages: AgentMessageDto[];
  suggestions: AgentSuggestionDto[];
}
```

### `AgentMessageDto`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Message id (may match client UIMessage id) |
| `seq` | number | Monotonic poll cursor |
| `role` | `"user" \| "assistant" \| "system"` | Role |
| `parts` | `AgentMessagePart[]` | Text and/or richer AI SDK parts |
| `actorUserId` | string \| null | Human author; null for agent |
| `actorName` | string \| null | Resolved from trip membership |
| `source` | `"chat" \| "mention" \| "operation" \| "threshold"` | Origin |
| `mentionedUserIds` | string[] | @mentioned Better Auth user ids |
| `createdAt` | string | ISO time |

Text part: `{ type: "text"; text: string }`. Assistant messages may include
tool / approval parts with additional fields.

### `AgentSuggestionDto`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Suggestion id |
| `messageId` | string \| null | Related session message |
| `status` | `"pending" \| "applied" \| "stale" \| "expired"` | Lifecycle |
| `severity` | `"info" \| "warning" \| "critical"` | Urgency |
| `reason` | string | Model reason |
| `suggestionText` | string | Human-readable suggestion |
| `patch` | `PendingPatch` | Discriminated patch (see below) |
| `expiresAt` | string \| null | Expiry |
| `appliedBy` | string \| null | Who applied |
| `createdAt` / `updatedAt` | string | ISO times |

### `PendingPatch`

Discriminated by `kind` (must match trip ops the aggregate supports):

| `kind` | Payload |
| --- | --- |
| `rename_trip` | `title` |
| `add_day` | (none) |
| `delete_day` | `dayNumber` |
| `update_day` | `dayNumber`, `changes` (same as day PATCH body) |
| `reorder_days` | `order: number[]` |
| `insert_stop` | `draft` (same as insert stop body) |
| `update_stop` | `stopId`, `changes` |
| `move_stop` | `move: { stopId, day, index }` |
| `add_expense` | `draft` (expense body) |
| `update_expense` | `expenseId`, `changes` |

Applying a patch always goes through domain trip methods after human approval.

### `ReservationDto`

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `tripId` | string | Reservation and owning trip ids |
| `type` | `flight \| accommodation \| restaurant \| rail \| ground_transport \| activity \| other` | Booking kind |
| `status` | `tentative \| confirmed \| cancelled \| completed` | Lifecycle |
| `title`, `provider`, `confirmationNumber` | string | Booking identity |
| `startAt`, `endAt` | ISO string / null | UTC instants |
| `timezone` | string | Display IANA timezone |
| `locationName`, `address` | string | Display location |
| `latitude`, `longitude` | number / null | Optional coordinate pair |
| `dayNumber`, `stopId`, `expenseId` | number/string / null | Optional trip links |
| `amountMinor`, `currency` | number/string / null | Optional booking amount |
| `notes` | string | Member notes |
| `createdBy`, `createdAt`, `updatedAt` | string | Audit fields |
| `revision` | number | `If-Match` concurrency token |

---

[← API index](./README.md)
