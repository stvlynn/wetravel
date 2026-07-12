import { describe, expect, it, vi } from "vitest";
import { Reservation } from "../src/domain/reservation";
import { SqlReservationRepository } from "../src/infrastructure/persistence/reservation-repository.db";
import type {
  QueryResult,
  SqlClient,
  SqlConnection,
} from "../src/infrastructure/persistence/sql";

const row = {
  id: "r1", trip_id: "t1", type: "flight", status: "confirmed",
  title: "VN 210", provider: "Vietnam Airlines", confirmation_number: "ABC",
  start_at: "2026-08-01T02:00:00.000Z", end_at: null,
  timezone: "Asia/Ho_Chi_Minh", location_name: "SGN", address: "",
  latitude: "10.8", longitude: "106.6", day_number: "1", stop_id: null,
  expense_id: null, amount_minor: "2500000", currency: "VND", notes: "",
  created_by: "u1", created_at: "2026-07-12T00:00:00.000Z",
  updated_at: "2026-07-12T00:00:00.000Z", revision: "0",
};

function result<T>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount };
}

describe("SqlReservationRepository", () => {
  it("maps SQL rows into reservation snapshots", async () => {
    const db = {
      provider: "postgres",
      query: vi.fn(async () => result([row])),
    } as unknown as SqlClient;
    const repository = new SqlReservationRepository(db);
    const reservations = await repository.listByTrip("t1");
    expect(reservations[0]!.toSnapshot()).toMatchObject({
      id: "r1",
      latitude: 10.8,
      longitude: 106.6,
      dayNumber: 1,
      amountMinor: 2500000,
      revision: 0,
    });
  });

  it("uses compare-and-swap and bumps the trip revision atomically", async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const connection = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.startsWith("UPDATE reservations")) return result([], 1);
        if (sql.startsWith("SELECT version")) return result([{ version: 8 }]);
        return result([]);
      }),
      release: vi.fn(),
    } as unknown as SqlConnection;
    const db = {
      provider: "postgres",
      connect: vi.fn(async () => connection),
    } as unknown as SqlClient;
    const reservation = Reservation.fromSnapshot({
      id: "r1", tripId: "t1", type: "flight", status: "confirmed",
      title: "VN 210", provider: "", confirmationNumber: "",
      startAt: "2026-08-01T02:00:00.000Z", endAt: null, timezone: "UTC",
      locationName: "", address: "", latitude: null, longitude: null,
      dayNumber: null, stopId: null, expenseId: null, amountMinor: null,
      currency: null, notes: "", createdBy: "u1",
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z", revision: 1,
    });
    const repository = new SqlReservationRepository(db);
    const saved = await repository.save(reservation, 0);
    expect(saved?.tripRevision).toBe(8);
    expect(queries.find((query) => query.sql.startsWith("UPDATE reservations"))?.params?.at(-1)).toBe(0);
    expect(queries.some((query) => query.sql.includes("version = version + 1"))).toBe(true);
    expect(queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("returns null without bumping the trip when compare-and-swap loses", async () => {
    const queries: string[] = [];
    const connection = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        return result([], 0);
      }),
      release: vi.fn(),
    } as unknown as SqlConnection;
    const db = { provider: "mysql", connect: vi.fn(async () => connection) } as unknown as SqlClient;
    const repository = new SqlReservationRepository(db);
    const reservation = Reservation.fromSnapshot({ ...rowToSnapshot(), revision: 1 });
    await expect(repository.save(reservation, 0)).resolves.toBeNull();
    expect(queries.some((sql) => sql.includes("version = version + 1"))).toBe(false);
    expect(queries.at(-1)).toBe("ROLLBACK");
  });
});

function rowToSnapshot() {
  return {
    id: "r1", tripId: "t1", type: "flight" as const, status: "confirmed" as const,
    title: "VN 210", provider: "", confirmationNumber: "",
    startAt: "2026-08-01T02:00:00.000Z", endAt: null, timezone: "UTC",
    locationName: "", address: "", latitude: null, longitude: null,
    dayNumber: null, stopId: null, expenseId: null, amountMinor: null,
    currency: null, notes: "", createdBy: "u1",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z", revision: 0,
  };
}
