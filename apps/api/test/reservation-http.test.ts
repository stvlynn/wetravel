import { describe, expect, it, vi } from "vitest";
import { ReservationConflictError } from "../src/application";
import type { Container } from "../src/infrastructure/composition/container";
import { createApp } from "../src/interfaces/http/app";

const current = {
  id: "r1",
  tripId: "t1",
  type: "flight" as const,
  status: "confirmed" as const,
  title: "VN 210",
  provider: "",
  confirmationNumber: "",
  startAt: "2026-08-01T02:00:00.000Z",
  endAt: null,
  timezone: "Asia/Ho_Chi_Minh",
  locationName: "",
  address: "",
  latitude: null,
  longitude: null,
  dayNumber: null,
  stopId: null,
  expenseId: null,
  amountMinor: null,
  currency: null,
  notes: "",
  createdBy: "u1",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  revision: 0,
};

function fixture() {
  const reservationService = {
    list: vi.fn(async () => [current]),
    create: vi.fn(async () => current),
    update: vi.fn(async () => current),
    cancel: vi.fn(async () => ({ ...current, status: "cancelled", revision: 1 })),
    delete: vi.fn(async () => {}),
  };
  const auth = {
    api: { getSession: vi.fn(async () => ({
      user: { id: "u1", name: "Ada", email: "ada@example.com", image: null },
      session: { id: "s1" },
    })) },
    handler: vi.fn(),
    $Infer: {} as Container["auth"]["$Infer"],
  };
  const container = {
    config: {
      trustedOrigins: ["https://app.example.test"],
      betterAuthUrl: "https://api.example.test",
      googleOAuth: null,
    },
    auth,
    reservationService,
    agentService: null,
    trackDeferred: () => {},
  } as unknown as Container;
  return { app: createApp(container), reservationService };
}

const createBody = {
  type: "flight",
  title: "VN 210",
  startAt: "2026-08-01T09:00:00+07:00",
  timezone: "Asia/Ho_Chi_Minh",
};

describe("reservation HTTP contract", () => {
  it("lists reservations for the current member", async () => {
    const { app, reservationService } = fixture();
    const response = await app.request("https://api.example.test/api/trips/t1/reservations");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: unknown };
    expect(body.data).toEqual([current]);
    expect(reservationService.list).toHaveBeenCalledWith("t1", "u1");
  });

  it("requires and forwards Idempotency-Key on create", async () => {
    const { app, reservationService } = fixture();
    const missing = await app.request("https://api.example.test/api/trips/t1/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
    expect(missing.status).toBe(400);

    const response = await app.request("https://api.example.test/api/trips/t1/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "key-1" },
      body: JSON.stringify(createBody),
    });
    expect(response.status).toBe(201);
    expect(reservationService.create).toHaveBeenCalledWith(
      "t1",
      "u1",
      expect.objectContaining({ title: "VN 210" }),
      "key-1",
    );
  });

  it("requires If-Match and forwards the parsed revision", async () => {
    const { app, reservationService } = fixture();
    const missing = await app.request("https://api.example.test/api/trips/t1/reservations/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(missing.status).toBe(428);

    const response = await app.request("https://api.example.test/api/trips/t1/reservations/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"3"' },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(response.status).toBe(200);
    expect(reservationService.update).toHaveBeenCalledWith(
      "t1",
      "r1",
      "u1",
      3,
      { title: "Updated" },
    );
  });

  it("returns the current server value on a compare-and-swap conflict", async () => {
    const { app, reservationService } = fixture();
    reservationService.update.mockRejectedValueOnce(
      new ReservationConflictError(current),
    );
    const response = await app.request("https://api.example.test/api/trips/t1/reservations/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": "0" },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "reservation_conflict", current: { id: "r1" } },
    });
  });
});
