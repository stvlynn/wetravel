# Error envelope


`apps/api/src/interfaces/http/errors.ts` maps thrown errors:

| Source | Typical status | `error.code` examples |
| --- | --- | --- |
| Zod | 400 | `validation_error` |
| Domain / input | 400 | domain codes (`empty_message`, `invalid_currency`, …) |
| Unauthenticated guard | 401 | `unauthenticated` |
| Forbidden | 403 | `insufficient_permissions` |
| Not found | 404 | `trip_not_found`, `suggestion_not_found`, `agent_disabled` |
| Conflict | 409 | `suggestion_not_pending`, `reservation_conflict` |
| Precondition required | 428 | `revision_required` |
| Avatar / media size | 413 | `avatar_too_large`, `media_too_large` |
| Weather/FX/geo | 502–504 / 503 | see weather/fx/geo docs |
| Unhandled | 500 | `internal_error` |

Example:

```json
{ "error": { "code": "unauthenticated", "message": "Sign in required" } }
```

Reservation compare-and-swap conflicts additionally return
`error.current` with the current `ReservationDto` or `null` when it was deleted.

---

Status code summary: [conventions.md](./conventions.md).

---

[← API index](./README.md)
