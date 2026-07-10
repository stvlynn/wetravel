import { describe, expect, it, vi } from "vitest";
import {
  provisionSampleTripForUser,
  SAMPLE_TRIP_ID,
} from "../src/application/user/provision-sample-trip";
import { Trip, type TripRepository } from "../src/domain/trip";
import { seedTrips } from "../src/infrastructure/persistence/seed-data";

function templateTrip(): Trip {
  return Trip.fromSnapshot(structuredClone(seedTrips()[0]!.snapshot));
}

function memoryRepo(): TripRepository & {
  created: Trip[];
  saved: Trip[];
} {
  const created: Trip[] = [];
  const saved: Trip[] = [];
  return {
    created,
    saved,
    findSummaries: async () => [],
    findById: async () => null,
    create: async (trip) => {
      created.push(trip);
    },
    addMember: async () => {},
    rename: async () => {},
    clearAgentSeedPending: async () => {},
    updateIntake: async () => {},
    addDay: async () => {},
    updateDay: async () => {},
    reorderDays: async () => {},
    deleteDay: async () => {},
    save: async (trip) => {
      saved.push(trip);
    },
  };
}

describe("provisionSampleTripForUser", () => {
  it("exposes the canonical sample trip id", () => {
    expect(SAMPLE_TRIP_ID).toBe("japan-2025");
  });

  it("persists a cloned sample trip for the new user", async () => {
    const repo = memoryRepo();
    const trip = await provisionSampleTripForUser(
      repo,
      { id: "u1", name: "Ada", image: null },
      async () => templateTrip(),
    );

    expect(trip).not.toBeNull();
    expect(repo.created).toHaveLength(1);
    expect(repo.saved).toHaveLength(1);
    expect(repo.created[0]!.id).toBe(trip!.id);
    expect(trip!.toSnapshot().ownerId).toBe("u1");
    expect(trip!.toSnapshot().members.some((m) => m.userId === "u1")).toBe(true);
  });

  it("returns null without throwing when provisioning fails", async () => {
    const repo = memoryRepo();
    repo.create = async () => {
      throw new Error("db down");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const trip = await provisionSampleTripForUser(
      repo,
      { id: "u1", name: "Ada" },
      async () => templateTrip(),
    );

    expect(trip).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
