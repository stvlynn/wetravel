import { describe, expect, it, vi } from "vitest";
import { ReservationService } from "../src/application";
import {
  Reservation,
  type ReservationRepository,
} from "../src/domain/reservation";
import type { TripChange } from "../src/domain/realtime";
import { Trip, type TripRepository } from "../src/domain/trip";

function fixture(role: "owner" | "viewer" = "owner") {
  const trip = Trip.create({ title: "Vietnam" }, { id: "u1", name: "Ada" });
  if (role === "viewer") {
    const snapshot = trip.toSnapshot();
    snapshot.members[0]!.role = "viewer";
  }
  let stored: Reservation | null = null;
  let tripRevision = trip.toSnapshot().version;
  const trips: TripRepository = {
    findSummaries: vi.fn(async () => []),
    findById: vi.fn(async () => trip),
    create: vi.fn(async () => {}),
    addMember: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    clearAgentSeedPending: vi.fn(async () => {}),
    updateIntake: vi.fn(async () => {}),
    addDay: vi.fn(async () => {}),
    updateDay: vi.fn(async () => {}),
    reorderDays: vi.fn(async () => {}),
    deleteDay: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
  };
  const reservations: ReservationRepository = {
    listByTrip: vi.fn(async () => (stored ? [stored] : [])),
    findById: vi.fn(async () => stored),
    create: vi.fn(async (reservation) => {
      stored = reservation;
      tripRevision += 1;
      return { reservation, tripRevision };
    }),
    save: vi.fn(async (reservation) => {
      stored = reservation;
      tripRevision += 1;
      return { reservation, tripRevision };
    }),
    delete: vi.fn(async () => {
      stored = null;
      tripRevision += 1;
      return { deleted: true, tripRevision };
    }),
  };
  const changes: TripChange[] = [];
  const service = new ReservationService(trips, reservations, {
    async publish(change) {
      changes.push(change);
    },
  });
  return { service, trip, reservations, changes, setStored: (value: Reservation) => { stored = value; } };
}

const draft = {
  type: "accommodation" as const,
  title: "Riverside Hotel",
  startAt: "2026-08-01T15:00:00+07:00",
  endAt: "2026-08-04T11:00:00+07:00",
  timezone: "Asia/Ho_Chi_Minh",
};

describe("ReservationService", () => {
  it("creates idempotently through the repository and publishes trip revision", async () => {
    const { service, reservations, changes } = fixture();
    const created = await service.create("trip-id", "u1", draft, "key-1");
    expect(created).toMatchObject({ title: "Riverside Hotel", revision: 0 });
    expect(reservations.create).toHaveBeenCalledWith(
      expect.any(Reservation),
      "key-1",
    );
    expect(changes).toEqual([
      expect.objectContaining({ revision: 1, scopes: ["reservations"] }),
    ]);
  });

  it("prevents viewers from writing", async () => {
    const { service } = fixture("viewer");
    await expect(service.create("trip-id", "u1", draft, "key-1")).rejects.toMatchObject({
      code: "insufficient_permissions",
    });
  });

  it("validates linked trip days and stops before persistence", async () => {
    const { service, reservations } = fixture();
    await expect(
      service.create(
        "trip-id",
        "u1",
        { ...draft, dayNumber: 99 },
        "key-1",
      ),
    ).rejects.toMatchObject({ code: "reservation_day_not_found" });
    expect(reservations.create).not.toHaveBeenCalled();
  });

  it("surfaces compare-and-swap conflicts with the current server value", async () => {
    const { service, reservations, setStored } = fixture();
    const existing = Reservation.create({
      id: "r1",
      tripId: "trip-id",
      actorId: "u1",
      now: "2026-07-12T00:00:00Z",
      draft,
    });
    setStored(existing);
    vi.mocked(reservations.save).mockResolvedValueOnce(null);

    await expect(
      service.update("trip-id", "r1", "u1", 0, { title: "New title" }),
    ).rejects.toMatchObject({
      name: "ReservationConflictError",
      current: expect.objectContaining({ id: "r1" }),
    });
  });

  it("surfaces stale If-Match conflicts with the current server value", async () => {
    const { service, setStored } = fixture();
    const existing = Reservation.create({
      id: "r1",
      tripId: "trip-id",
      actorId: "u1",
      now: "2026-07-12T00:00:00Z",
      draft,
    });
    setStored(existing);

    await expect(
      service.update("trip-id", "r1", "u1", 99, { title: "New title" }),
    ).rejects.toMatchObject({
      name: "ReservationConflictError",
      current: expect.objectContaining({ id: "r1", revision: 0 }),
    });
  });

  it("rejects partial updates that leave stop and day mismatched", async () => {
    const { service, trip, setStored } = fixture();
    trip.addDay();
    const memberId = trip.toSnapshot().members[0]!.id;
    const stop = trip.insertStop(
      { day: 1, index: 0, name: "Old Quarter", time: "10:00" },
      memberId,
    );
    const existing = Reservation.create({
      id: "r1",
      tripId: "trip-id",
      actorId: "u1",
      now: "2026-07-12T00:00:00Z",
      draft: { ...draft, dayNumber: 1, stopId: stop.id },
    });
    setStored(existing);

    await expect(
      service.update("trip-id", "r1", "u1", 0, { dayNumber: 2 }),
    ).rejects.toMatchObject({ code: "reservation_stop_day_mismatch" });
  });

  it("cancels and deletes by explicit revision", async () => {
    const { service } = fixture();
    const created = await service.create("trip-id", "u1", draft, "key-1");
    const cancelled = await service.cancel(
      "trip-id",
      created.id,
      "u1",
      created.revision,
    );
    expect(cancelled.status).toBe("cancelled");
    await expect(
      service.delete("trip-id", created.id, "u1", cancelled.revision),
    ).resolves.toBeUndefined();
  });
});
