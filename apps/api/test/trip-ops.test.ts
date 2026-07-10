import { describe, expect, it } from "vitest";
import type { PendingPatch } from "../src/domain/agent";
import { Trip } from "../src/domain/trip";
import type { TripRepository } from "../src/domain/trip";
import { seedTrips } from "../src/infrastructure/persistence/seed-data";
import {
  applyTripOp,
  getTripOp,
  listTripOps,
  listWriteOps,
  pendingPatchSchema,
  writeToolNames,
  type TripOpContext,
} from "../src/application/trip/ops";

function freshTrip(): Trip {
  return Trip.fromSnapshot(structuredClone(seedTrips()[0]!.snapshot));
}

/** Minimal in-memory repo capturing calls without I/O. */
function memoryRepo(): TripRepository {
  return {
    async findSummaries() {
      return [];
    },
    async findById() {
      return null;
    },
    async create() {},
    async addMember() {},
    async rename() {},
    async clearAgentSeedPending() {},
    async updateIntake() {},
    async addDay() {},
    async updateDay() {},
    async reorderDays() {},
    async deleteDay() {},
    async save() {},
  };
}

function ctx(trip: Trip): TripOpContext {
  const member = trip.toSnapshot().members[0]!;
  const actorUserId = member.userId ?? member.id;
  return { trip, actorUserId, tripRepo: memoryRepo() };
}

describe("trip ops catalog", () => {
  it("has unique kinds and tool names", () => {
    const ops = listTripOps();
    const kinds = ops.map((o) => o.kind);
    const tools = ops.map((o) => o.toolName);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(new Set(tools).size).toBe(tools.length);
  });

  it("covers every PendingPatch kind with a catalog entry", () => {
    const kinds: PendingPatch["kind"][] = [
      "rename_trip",
      "add_day",
      "delete_day",
      "update_day",
      "reorder_days",
      "insert_stop",
      "update_stop",
      "move_stop",
      "add_expense",
      "update_expense",
    ];
    for (const kind of kinds) {
      expect(getTripOp(kind), `missing op for ${kind}`).toBeDefined();
    }
  });

  it("lists write tools that all need approval", () => {
    const write = listWriteOps();
    expect(write.length).toBeGreaterThan(0);
    expect(write.every((o) => o.needsApproval)).toBe(true);
    expect(writeToolNames()).toEqual(write.map((o) => o.toolName));
  });

  it("validates pendingPatchSchema against catalog toPatch outputs", () => {
    const insert = getTripOp("insert_stop")!;
    const patch = insert.toPatch({
      day: 1,
      index: 0,
      name: "Cafe",
      time: "10:00",
    } as never);
    expect(pendingPatchSchema.parse(patch)).toEqual(patch);
  });

  it("applyTripOp insert_stop adds a stop and returns a summary", async () => {
    const trip = Trip.create({ title: "Ops test" }, { id: "u1", name: "Ada" });
    const before = trip.toSnapshot().stops.length;

    const result = await applyTripOp(
      { trip, actorUserId: "u1", tripRepo: memoryRepo() },
      {
        kind: "insert_stop",
        draft: {
          day: 1,
          index: 0,
          name: "Test Cafe",
          time: "09:30",
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toMatch(/Test Cafe/);
      expect(result.summary).toMatch(/Inserted stop/);
    }
    expect(trip.toSnapshot().stops.length).toBe(before + 1);
    expect(trip.toSnapshot().stops.some((s) => s.name === "Test Cafe")).toBe(
      true,
    );
  });

  it("applyTripOp rename_trip updates the title", async () => {
    const trip = freshTrip();
    const result = await applyTripOp(ctx(trip), {
      kind: "rename_trip",
      title: "New Title",
    });
    expect(result).toEqual({
      ok: true,
      summary: 'Renamed trip to "New Title"',
    });
    expect(trip.toSnapshot().title).toBe("New Title");
  });

  it("toPatch maps tool args for every write op without throwing", () => {
    for (const op of listWriteOps()) {
      const sample = sampleInput(op.kind);
      const patch = op.toPatch(sample as never);
      expect(patch.kind).toBe(op.kind);
      expect(pendingPatchSchema.safeParse(patch).success).toBe(true);
    }
  });
});

function sampleInput(kind: PendingPatch["kind"]): unknown {
  switch (kind) {
    case "rename_trip":
      return { title: "T" };
    case "add_day":
      return {};
    case "delete_day":
      return { dayNumber: 1 };
    case "update_day":
      return { dayNumber: 1, changes: { city: "Osaka" } };
    case "reorder_days":
      return { order: [1] };
    case "insert_stop":
      return { day: 1, index: 0, name: "X", time: "10:00" };
    case "update_stop":
      return { stopId: "s1", changes: { name: "Y" } };
    case "move_stop":
      return { stopId: "s1", day: 1, index: 0 };
    case "add_expense":
      return {
        description: "Taxi",
        amount: 1000,
        payer: "m1",
        participants: ["m1"],
      };
    case "update_expense":
      return {
        expenseId: "e1",
        changes: {
          description: "Taxi",
          amount: 1000,
          payer: "m1",
          participants: ["m1"],
        },
      };
  }
}
