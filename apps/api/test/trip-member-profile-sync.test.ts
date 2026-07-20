import { describe, expect, it, vi } from "vitest";
import type {
  SqlClient,
  SqlConnection,
} from "../src/infrastructure/persistence/sql";
import { SqlTripRepository } from "../src/infrastructure/persistence/trip-repository.db";

describe("SqlTripRepository.syncMemberProfile", () => {
  it("updates member display fields and bumps affected trip revisions atomically", async () => {
    const transactionQueries: Array<{ sql: string; params: unknown[] }> = [];
    const connection = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        transactionQueries.push({ sql, params });
        if (/SELECT version/i.test(sql)) {
          return {
            rows: [{ version: params[0] === "trip-1" ? 4 : 9 }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    } as unknown as SqlConnection;
    const db = {
      provider: "postgres" as const,
      query: vi.fn(async () => ({
        rows: [{ trip_id: "trip-1" }, { trip_id: "trip-2" }],
        rowCount: 2,
      })),
      connect: vi.fn(async () => connection),
      end: vi.fn(async () => undefined),
    } as unknown as SqlClient;
    const repository = new SqlTripRepository(db);

    await expect(
      repository.syncMemberProfile("user-1", {
        name: "Ada Lovelace",
        image: "https://api.test/avatar.png",
      }),
    ).resolves.toEqual([
      { tripId: "trip-1", revision: 4 },
      { tripId: "trip-2", revision: 9 },
    ]);

    const memberUpdate = transactionQueries.find(({ sql }) =>
      /UPDATE trip_members/i.test(sql),
    );
    expect(memberUpdate?.params).toEqual([
      "user-1",
      "Ada Lovelace",
      "Ada",
      "AL",
      "https://api.test/avatar.png",
    ]);
    expect(
      transactionQueries.filter(({ sql }) => /UPDATE trips/i.test(sql)),
    ).toHaveLength(2);
    expect(transactionQueries.at(0)?.sql).toBe("BEGIN");
    expect(transactionQueries.at(-1)?.sql).toBe("COMMIT");
  });
});
