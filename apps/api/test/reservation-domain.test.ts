import { describe, expect, it } from "vitest";
import { Reservation } from "../src/domain/reservation";

function create() {
  return Reservation.create({
    id: "r1",
    tripId: "t1",
    actorId: "u1",
    now: "2026-07-12T00:00:00Z",
    draft: {
      type: "flight",
      status: "confirmed",
      title: "  VN 210  ",
      provider: " Vietnam Airlines ",
      startAt: "2026-08-01T09:00:00+07:00",
      endAt: "2026-08-01T11:00:00+07:00",
      timezone: "Asia/Ho_Chi_Minh",
      amountMinor: 2500000,
      currency: "vnd",
    },
  });
}

describe("Reservation aggregate", () => {
  it("normalizes a new reservation", () => {
    expect(create().toSnapshot()).toMatchObject({
      title: "VN 210",
      provider: "Vietnam Airlines",
      startAt: "2026-08-01T02:00:00.000Z",
      endAt: "2026-08-01T04:00:00.000Z",
      currency: "VND",
      revision: 0,
    });
  });

  it("requires zoned times and rejects inverted ranges", () => {
    expect(() =>
      Reservation.create({
        id: "r1",
        tripId: "t1",
        actorId: "u1",
        now: "2026-07-12T00:00:00Z",
        draft: {
          type: "rail",
          title: "Train",
          startAt: "2026-08-01T09:00:00",
          timezone: "Asia/Tokyo",
        },
      }),
    ).toThrow(/timezone/i);
    expect(() =>
      Reservation.create({
        id: "r1",
        tripId: "t1",
        actorId: "u1",
        now: "2026-07-12T00:00:00Z",
        draft: {
          type: "rail",
          title: "Train",
          startAt: "2026-08-01T10:00:00Z",
          endAt: "2026-08-01T09:00:00Z",
          timezone: "UTC",
        },
      }),
    ).toThrow(/before/i);
  });

  it("requires currency with minor-unit money", () => {
    const snapshot = create().toSnapshot();
    expect(() =>
      Reservation.create({
        id: "r2",
        tripId: "t1",
        actorId: "u1",
        now: snapshot.createdAt,
        draft: {
          type: "other",
          title: "Pass",
          startAt: snapshot.startAt,
          timezone: "UTC",
          amountMinor: 100,
        },
      }),
    ).toThrow(/currency/i);
  });

  it("updates by revision and rejects stale writers", () => {
    const reservation = create();
    reservation.update(
      { title: "VN 211" },
      0,
      "2026-07-13T00:00:00Z",
    );
    expect(reservation.toSnapshot()).toMatchObject({
      title: "VN 211",
      revision: 1,
    });
    expect(() =>
      reservation.update(
        { title: "Stale" },
        0,
        "2026-07-13T00:00:00Z",
      ),
    ).toThrow(/changed/i);
  });

  it("supports valid lifecycle transitions and keeps cancellation terminal", () => {
    const reservation = create();
    reservation.update(
      { status: "completed" },
      0,
      "2026-08-02T00:00:00Z",
    );
    expect(() =>
      reservation.update(
        { status: "confirmed" },
        1,
        "2026-08-03T00:00:00Z",
      ),
    ).toThrow(/cannot move/i);

    const cancelled = create();
    cancelled.cancel(0, "2026-07-13T00:00:00Z");
    expect(cancelled.toSnapshot()).toMatchObject({
      status: "cancelled",
      revision: 1,
    });
    expect(() =>
      cancelled.update(
        { title: "No" },
        1,
        "2026-07-14T00:00:00Z",
      ),
    ).toThrow(/cancelled/i);
  });

  it("requires coordinate pairs and valid day numbers", () => {
    const reservation = create();
    expect(() =>
      reservation.update(
        { latitude: 10.8 },
        0,
        "2026-07-13T00:00:00Z",
      ),
    ).toThrow(/together/i);
    expect(() =>
      reservation.update(
        { dayNumber: 0 },
        0,
        "2026-07-13T00:00:00Z",
      ),
    ).toThrow(/positive/i);
  });
});
