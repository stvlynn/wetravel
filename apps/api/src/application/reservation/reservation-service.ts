import {
  Reservation,
  type CreateReservationDraft,
  type ReservationRepository,
  type ReservationSnapshot,
  type UpdateReservationDraft,
} from "../../domain/reservation";
import {
  createTripChange,
  type TripChangePublisher,
} from "../../domain/realtime";
import { DomainError, NotFoundError } from "../../domain/shared/errors";
import type { Trip, TripRepository } from "../../domain/trip";
import { ForbiddenError } from "../use-cases";

export class ReservationConflictError extends Error {
  constructor(
    public readonly current: ReservationSnapshot | null,
    message = "The reservation has changed since it was loaded",
  ) {
    super(message);
    this.name = "ReservationConflictError";
  }
}

export class ReservationService {
  constructor(
    private readonly trips: TripRepository,
    private readonly reservations: ReservationRepository,
    private readonly changes: TripChangePublisher | null = null,
  ) {}

  async list(tripId: string, userId: string): Promise<ReservationSnapshot[]> {
    await this.loadReadableTrip(tripId, userId);
    const reservations = await this.reservations.listByTrip(tripId);
    return reservations.map((reservation) => reservation.toSnapshot());
  }

  async create(
    tripId: string,
    userId: string,
    draft: CreateReservationDraft,
    idempotencyKey: string,
  ): Promise<ReservationSnapshot> {
    const trip = await this.loadEditableTrip(tripId, userId);
    this.validateAssociations(trip, draft);
    const reservation = Reservation.create({
      id: crypto.randomUUID(),
      tripId,
      actorId: userId,
      now: new Date().toISOString(),
      draft,
    });
    const result = await this.reservations.create(
      reservation,
      normalizeIdempotencyKey(idempotencyKey),
    );
    await this.publish(tripId, userId, result.tripRevision);
    return result.reservation.toSnapshot();
  }

  async update(
    tripId: string,
    reservationId: string,
    userId: string,
    expectedRevision: number,
    draft: UpdateReservationDraft,
  ): Promise<ReservationSnapshot> {
    const trip = await this.loadEditableTrip(tripId, userId);
    const reservation = await this.requireReservation(tripId, reservationId);
    const current = reservation.toSnapshot();
    this.validateAssociations(trip, {
      dayNumber:
        draft.dayNumber !== undefined ? draft.dayNumber : current.dayNumber,
      stopId: draft.stopId !== undefined ? draft.stopId : current.stopId,
      expenseId:
        draft.expenseId !== undefined ? draft.expenseId : current.expenseId,
    });
    const previousRevision = current.revision;
    this.withRevisionGuard(reservation, () => {
      reservation.update(draft, expectedRevision, new Date().toISOString());
    });
    const result = await this.reservations.save(reservation, previousRevision);
    if (!result) {
      const latest = await this.reservations.findById(tripId, reservationId);
      throw new ReservationConflictError(latest?.toSnapshot() ?? null);
    }
    await this.publish(tripId, userId, result.tripRevision);
    return result.reservation.toSnapshot();
  }

  async cancel(
    tripId: string,
    reservationId: string,
    userId: string,
    expectedRevision: number,
  ): Promise<ReservationSnapshot> {
    await this.loadEditableTrip(tripId, userId);
    const reservation = await this.requireReservation(tripId, reservationId);
    const previousRevision = reservation.toSnapshot().revision;
    this.withRevisionGuard(reservation, () => {
      reservation.cancel(expectedRevision, new Date().toISOString());
    });
    const result = await this.reservations.save(reservation, previousRevision);
    if (!result) {
      const current = await this.reservations.findById(tripId, reservationId);
      throw new ReservationConflictError(current?.toSnapshot() ?? null);
    }
    await this.publish(tripId, userId, result.tripRevision);
    return result.reservation.toSnapshot();
  }

  async delete(
    tripId: string,
    reservationId: string,
    userId: string,
    expectedRevision: number,
  ): Promise<void> {
    await this.loadEditableTrip(tripId, userId);
    const existing = await this.requireReservation(tripId, reservationId);
    this.withRevisionGuard(existing, () => {
      existing.assertRevision(expectedRevision);
    });
    const result = await this.reservations.delete(
      tripId,
      reservationId,
      expectedRevision,
    );
    if (!result.deleted) {
      const current = await this.reservations.findById(tripId, reservationId);
      throw new ReservationConflictError(current?.toSnapshot() ?? null);
    }
    await this.publish(tripId, userId, result.tripRevision);
  }

  private async loadReadableTrip(tripId: string, userId: string): Promise<Trip> {
    const trip = await this.trips.findById(tripId);
    if (!trip || !trip.permissionsFor(userId).isMember) {
      throw new NotFoundError("trip_not_found", `Trip ${tripId} not found`);
    }
    return trip;
  }

  private async loadEditableTrip(tripId: string, userId: string): Promise<Trip> {
    const trip = await this.loadReadableTrip(tripId, userId);
    if (!trip.permissionsFor(userId).canEdit) {
      throw new ForbiddenError(
        "insufficient_permissions",
        "You do not have permission to edit this trip",
      );
    }
    return trip;
  }

  private async requireReservation(
    tripId: string,
    reservationId: string,
  ): Promise<Reservation> {
    const reservation = await this.reservations.findById(tripId, reservationId);
    if (!reservation) {
      throw new NotFoundError(
        "reservation_not_found",
        `Reservation ${reservationId} not found`,
      );
    }
    return reservation;
  }

  private validateAssociations(
    trip: Trip,
    draft: Pick<
      UpdateReservationDraft,
      "dayNumber" | "stopId" | "expenseId"
    >,
  ): void {
    const snapshot = trip.toSnapshot();
    if (
      draft.dayNumber != null &&
      !snapshot.days.some((day) => day.number === draft.dayNumber)
    ) {
      throw new NotFoundError(
        "reservation_day_not_found",
        `Trip day ${draft.dayNumber} not found`,
      );
    }
    if (
      draft.stopId != null &&
      !snapshot.stops.some((stop) => stop.id === draft.stopId)
    ) {
      throw new NotFoundError(
        "reservation_stop_not_found",
        `Trip stop ${draft.stopId} not found`,
      );
    }
    if (draft.stopId != null && draft.dayNumber != null) {
      const stop = snapshot.stops.find((item) => item.id === draft.stopId);
      if (stop && stop.day !== draft.dayNumber) {
        throw new NotFoundError(
          "reservation_stop_day_mismatch",
          "The linked stop does not belong to the selected trip day",
        );
      }
    }
    if (
      draft.expenseId != null &&
      !snapshot.expenses.some((expense) => expense.id === draft.expenseId)
    ) {
      throw new NotFoundError(
        "reservation_expense_not_found",
        `Trip expense ${draft.expenseId} not found`,
      );
    }
  }

  /** Domain revision mismatches become ReservationConflictError with `current`. */
  private withRevisionGuard(reservation: Reservation, action: () => void): void {
    try {
      action();
    } catch (error) {
      if (error instanceof DomainError && error.code === "reservation_conflict") {
        throw new ReservationConflictError(reservation.toSnapshot());
      }
      throw error;
    }
  }

  private async publish(
    tripId: string,
    actorId: string,
    tripRevision: number,
  ): Promise<void> {
    if (!this.changes) return;
    try {
      await this.changes.publish(
        createTripChange({
          eventId: crypto.randomUUID(),
          tripId,
          revision: tripRevision,
          actorId,
          occurredAt: new Date().toISOString(),
          scopes: ["reservations"],
        }),
      );
    } catch (error) {
      console.error("Failed to publish reservation change", {
        tripId,
        tripRevision,
        error,
      });
    }
  }
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new Error("Idempotency-Key must contain 1 to 200 characters");
  }
  return normalized;
}
