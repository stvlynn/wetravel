import { DomainError } from "../shared/errors";
import {
  RESERVATION_STATUSES,
  RESERVATION_TYPES,
  type CreateReservationDraft,
  type ReservationSnapshot,
  type ReservationStatus,
  type UpdateReservationDraft,
} from "./types";

const ISO_DATE_TIME_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

export class Reservation {
  private constructor(private snapshot: ReservationSnapshot) {}

  static create(params: {
    id: string;
    tripId: string;
    actorId: string;
    now: string;
    draft: CreateReservationDraft;
  }): Reservation {
    const id = required(params.id, "reservation id", 120);
    const tripId = required(params.tripId, "trip id", 120);
    const actorId = required(params.actorId, "creator id", 120);
    const now = normalizeDateTime(params.now, "created time");
    const normalized = normalizeDraft(params.draft);
    if (normalized.status === "cancelled" || normalized.status === "completed") {
      throw new DomainError(
        "invalid_reservation_status",
        "A reservation must be tentative or confirmed when created",
      );
    }
    return new Reservation({
      id,
      tripId,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      ...normalized,
    });
  }

  static fromSnapshot(snapshot: ReservationSnapshot): Reservation {
    return new Reservation(structuredClone(snapshot));
  }

  toSnapshot(): ReservationSnapshot {
    return structuredClone(this.snapshot);
  }

  update(
    draft: UpdateReservationDraft,
    expectedRevision: number,
    now: string,
  ): void {
    this.assertRevision(expectedRevision);
    if (this.snapshot.status === "cancelled") {
      throw new DomainError(
        "reservation_cancelled",
        "A cancelled reservation cannot be edited",
      );
    }
    const merged: CreateReservationDraft = {
      type: draft.type ?? this.snapshot.type,
      status: draft.status ?? this.snapshot.status,
      title: draft.title ?? this.snapshot.title,
      provider: draft.provider ?? this.snapshot.provider,
      confirmationNumber:
        draft.confirmationNumber ?? this.snapshot.confirmationNumber,
      startAt: draft.startAt ?? this.snapshot.startAt,
      endAt: draft.endAt === undefined ? this.snapshot.endAt : draft.endAt,
      timezone: draft.timezone ?? this.snapshot.timezone,
      locationName: draft.locationName ?? this.snapshot.locationName,
      address: draft.address ?? this.snapshot.address,
      latitude:
        draft.latitude === undefined ? this.snapshot.latitude : draft.latitude,
      longitude:
        draft.longitude === undefined ? this.snapshot.longitude : draft.longitude,
      dayNumber:
        draft.dayNumber === undefined ? this.snapshot.dayNumber : draft.dayNumber,
      stopId: draft.stopId === undefined ? this.snapshot.stopId : draft.stopId,
      expenseId:
        draft.expenseId === undefined ? this.snapshot.expenseId : draft.expenseId,
      amountMinor:
        draft.amountMinor === undefined
          ? this.snapshot.amountMinor
          : draft.amountMinor,
      currency:
        draft.currency === undefined ? this.snapshot.currency : draft.currency,
      notes: draft.notes ?? this.snapshot.notes,
    };
    const normalized = normalizeDraft(merged);
    this.assertTransition(normalized.status);
    this.snapshot = {
      ...this.snapshot,
      ...normalized,
      updatedAt: normalizeDateTime(now, "updated time"),
      revision: this.snapshot.revision + 1,
    };
  }

  cancel(expectedRevision: number, now: string): void {
    this.assertRevision(expectedRevision);
    if (this.snapshot.status === "cancelled") return;
    this.snapshot.status = "cancelled";
    this.snapshot.updatedAt = normalizeDateTime(now, "updated time");
    this.snapshot.revision += 1;
  }

  assertRevision(expectedRevision: number): void {
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
      expectedRevision !== this.snapshot.revision
    ) {
      throw new DomainError(
        "reservation_conflict",
        "The reservation has changed since it was loaded",
      );
    }
  }

  private assertTransition(next: ReservationStatus): void {
    const current = this.snapshot.status;
    if (current === next) return;
    const allowed: Record<ReservationStatus, ReservationStatus[]> = {
      tentative: ["confirmed", "cancelled"],
      confirmed: ["tentative", "completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!allowed[current].includes(next)) {
      throw new DomainError(
        "invalid_reservation_status",
        `Reservation cannot move from ${current} to ${next}`,
      );
    }
  }
}

function normalizeDraft(draft: CreateReservationDraft) {
  if (!RESERVATION_TYPES.includes(draft.type)) {
    throw new DomainError("invalid_reservation_type", "Reservation type is invalid");
  }
  const status = draft.status ?? "tentative";
  if (!RESERVATION_STATUSES.includes(status)) {
    throw new DomainError(
      "invalid_reservation_status",
      "Reservation status is invalid",
    );
  }
  const startAt = normalizeDateTime(draft.startAt, "start time");
  const endAt = draft.endAt
    ? normalizeDateTime(draft.endAt, "end time")
    : null;
  if (endAt && Date.parse(endAt) < Date.parse(startAt)) {
    throw new DomainError(
      "invalid_reservation_time",
      "Reservation end time cannot be before its start time",
    );
  }

  const latitude = coordinate(draft.latitude, -90, 90, "latitude");
  const longitude = coordinate(draft.longitude, -180, 180, "longitude");
  if ((latitude === null) !== (longitude === null)) {
    throw new DomainError(
      "invalid_reservation_location",
      "Latitude and longitude must be provided together",
    );
  }

  const amountMinor = normalizeAmount(draft.amountMinor);
  const currency = draft.currency?.trim().toUpperCase() || null;
  if (amountMinor !== null && !currency) {
    throw new DomainError(
      "reservation_currency_required",
      "Currency is required when an amount is present",
    );
  }
  if (currency && !ISO_CURRENCY.test(currency)) {
    throw new DomainError(
      "invalid_reservation_currency",
      "Reservation currency must be a three-letter ISO code",
    );
  }

  const dayNumber = draft.dayNumber ?? null;
  if (dayNumber !== null && (!Number.isInteger(dayNumber) || dayNumber < 1)) {
    throw new DomainError(
      "invalid_reservation_day",
      "Reservation day must be a positive integer",
    );
  }

  return {
    type: draft.type,
    status,
    title: required(draft.title, "title", 160),
    provider: optional(draft.provider, 160),
    confirmationNumber: optional(draft.confirmationNumber, 160),
    startAt,
    endAt,
    timezone: required(draft.timezone, "timezone", 100),
    locationName: optional(draft.locationName, 200),
    address: optional(draft.address, 500),
    latitude,
    longitude,
    dayNumber,
    stopId: nullableText(draft.stopId, 120),
    expenseId: nullableText(draft.expenseId, 120),
    amountMinor,
    currency: amountMinor === null ? null : currency,
    notes: optional(draft.notes, 10_000),
  };
}

function normalizeDateTime(value: string, label: string): string {
  const trimmed = value.trim();
  if (!ISO_DATE_TIME_WITH_ZONE.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    throw new DomainError(
      "invalid_reservation_time",
      `Reservation ${label} must be an ISO date-time with a timezone`,
    );
  }
  return new Date(trimmed).toISOString();
}

function required(value: string, label: string, max: number): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError("invalid_reservation", `Reservation ${label} is required`);
  }
  if (normalized.length > max) {
    throw new DomainError(
      "invalid_reservation",
      `Reservation ${label} is too long`,
    );
  }
  return normalized;
}

function optional(value: string | undefined, max: number): string {
  const normalized = value?.trim() ?? "";
  if (normalized.length > max) {
    throw new DomainError("invalid_reservation", "Reservation text is too long");
  }
  return normalized;
}

function nullableText(
  value: string | null | undefined,
  max: number,
): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > max) {
    throw new DomainError("invalid_reservation", "Reservation reference is too long");
  }
  return normalized;
}

function coordinate(
  value: number | null | undefined,
  min: number,
  max: number,
  label: string,
): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new DomainError(
      "invalid_reservation_location",
      `Reservation ${label} is invalid`,
    );
  }
  return value;
}

function normalizeAmount(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(
      "invalid_reservation_amount",
      "Reservation amount must be a non-negative integer in minor units",
    );
  }
  return value;
}

