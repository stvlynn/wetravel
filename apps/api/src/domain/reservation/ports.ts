import type { Reservation } from "./reservation";

export interface ReservationWriteResult {
  reservation: Reservation;
  /** Trip-wide revision bumped atomically with the reservation write. */
  tripRevision: number;
}

export interface ReservationRepository {
  listByTrip(tripId: string): Promise<Reservation[]>;
  findById(tripId: string, id: string): Promise<Reservation | null>;
  create(
    reservation: Reservation,
    idempotencyKey: string,
  ): Promise<ReservationWriteResult>;
  /** Compare-and-swap the previous revision. */
  save(
    reservation: Reservation,
    previousRevision: number,
  ): Promise<ReservationWriteResult | null>;
  delete(
    tripId: string,
    id: string,
    expectedRevision: number,
  ): Promise<{ deleted: boolean; tripRevision: number }>;
}
