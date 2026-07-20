import { describe, expect, it, vi } from "vitest";
import {
  normalizeDisplayName,
  UserProfileProjectionService,
} from "../src/application/user/profile-projection-service";
import type { TripChangePublisher } from "../src/domain/realtime";

describe("UserProfileProjectionService", () => {
  it("normalizes and validates display names", () => {
    expect(normalizeDisplayName("  Traveler  ")).toBe("Traveler");
    expect(() => normalizeDisplayName("   ")).toThrow(
      "Display name must be between 1 and 64 characters",
    );
    expect(() => normalizeDisplayName("x".repeat(65))).toThrow(
      "Display name must be between 1 and 64 characters",
    );
  });

  it("synchronizes member projections and publishes each affected trip", async () => {
    const projection = {
      syncMemberProfile: vi.fn(async () => [
        { tripId: "trip-1", revision: 3 },
        { tripId: "trip-2", revision: 8 },
      ]),
    };
    const publisher: TripChangePublisher = {
      publish: vi.fn(async () => undefined),
    };
    const service = new UserProfileProjectionService(projection, publisher);

    await service.synchronize("user-1", {
      name: "Traveler",
      image: "https://api.test/avatar.png",
    });

    expect(projection.syncMemberProfile).toHaveBeenCalledWith("user-1", {
      name: "Traveler",
      image: "https://api.test/avatar.png",
    });
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "trip-1",
        revision: 3,
        actorId: "user-1",
        scopes: ["members"],
      }),
    );
  });

  it("keeps a committed projection when realtime publication fails", async () => {
    const projection = {
      syncMemberProfile: vi.fn(async () => [
        { tripId: "trip-1", revision: 2 },
      ]),
    };
    const publisher: TripChangePublisher = {
      publish: vi.fn(async () => {
        throw new Error("publisher unavailable");
      }),
    };
    const service = new UserProfileProjectionService(projection, publisher);

    await expect(
      service.synchronize("user-1", { name: "Traveler" }),
    ).resolves.toBeUndefined();
  });
});
