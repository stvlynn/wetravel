import { describe, expect, it } from "vitest";
import { mergeTripSummaries, stopsForDay } from "./lib";
import type { TripStop, TripSummary } from "./model";

describe("trip helpers", () => {
  it("groups stops by itinerary day", () => {
    const stops = [{ id: "a", day: 1 }, { id: "b", day: 2 }] as TripStop[];
    expect(stopsForDay(stops, 2).map((stop) => stop.id)).toEqual(["b"]);
  });

  it("keeps a mutation echo over a stale fetched summary", () => {
    const stale = { id: "trip", title: "Old", createdAt: "2026-01-01" } as TripSummary;
    const echoed = { id: "trip", title: "New", createdAt: "2026-01-02" } as TripSummary;
    expect(mergeTripSummaries([stale], [echoed])).toEqual([echoed]);
  });
});
