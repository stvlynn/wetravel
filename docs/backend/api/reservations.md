# Reservations

Reservations are trip-owned records for flights, accommodation, restaurants,
rail, ground transport, activities, and other bookings. All routes require a
trip member; commands additionally require edit permission.

## List

`GET /api/trips/:id/reservations` returns `ReservationDto[]`, ordered by start
time.

## Create

`POST /api/trips/:id/reservations` requires an `Idempotency-Key` header. Reusing
the same key for the same trip and creator returns the original reservation
without creating a duplicate.

Required body fields are `type`, `title`, `startAt`, and `timezone`. Date-times
must include `Z` or an explicit UTC offset. Optional `amountMinor` is an integer
in minor units and requires a three-letter `currency`.

## Update

`PATCH /api/trips/:id/reservations/:reservationId` requires `If-Match` with the
current numeric revision, for example `If-Match: "3"`. The body is a non-empty
partial create body.

## Cancel

`POST /api/trips/:id/reservations/:reservationId/cancel` requires `If-Match`.
Cancellation retains the record and is terminal.

## Delete

`DELETE /api/trips/:id/reservations/:reservationId` requires `If-Match` and
permanently removes the reservation.

Stale commands return `409 reservation_conflict` with the current server
reservation as `error.current` whenever the record still exists (stale
`If-Match` and compare-and-swap failures). Clients must refresh from
`error.current` before retrying and must not silently overwrite it.

---

[← API index](./README.md) · [Route index](./routes.md)
