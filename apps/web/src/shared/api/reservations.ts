import type {
  Reservation,
  ReservationDraft,
} from "@/entities/reservation";
import { apiFetch } from "./client";

export function fetchReservations(tripId: string): Promise<Reservation[]> {
  return apiFetch(`/api/trips/${encodeURIComponent(tripId)}/reservations`);
}

export function createReservation(
  tripId: string,
  input: ReservationDraft,
  idempotencyKey: string,
): Promise<Reservation> {
  return apiFetch(`/api/trips/${encodeURIComponent(tripId)}/reservations`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function updateReservation(
  tripId: string,
  reservation: Reservation,
  input: Partial<ReservationDraft>,
): Promise<Reservation> {
  return apiFetch(
    `/api/trips/${encodeURIComponent(tripId)}/reservations/${encodeURIComponent(reservation.id)}`,
    {
      method: "PATCH",
      headers: { "If-Match": String(reservation.revision) },
      body: JSON.stringify(input),
    },
  );
}

export function cancelReservation(
  tripId: string,
  reservation: Reservation,
): Promise<Reservation> {
  return apiFetch(
    `/api/trips/${encodeURIComponent(tripId)}/reservations/${encodeURIComponent(reservation.id)}/cancel`,
    {
      method: "POST",
      headers: { "If-Match": String(reservation.revision) },
    },
  );
}

export function deleteReservation(
  tripId: string,
  reservation: Reservation,
): Promise<{ deleted: true }> {
  return apiFetch(
    `/api/trips/${encodeURIComponent(tripId)}/reservations/${encodeURIComponent(reservation.id)}`,
    {
      method: "DELETE",
      headers: { "If-Match": String(reservation.revision) },
    },
  );
}
