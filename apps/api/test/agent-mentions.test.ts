import { describe, expect, it } from "vitest";
import { Trip } from "../src/domain/trip";
import { seedTrips } from "../src/infrastructure/persistence/seed-data";
import {
  buildUserMessageParts,
  containsAgentMention,
  mentionedUserIdsFromParts,
  parseMemberMentions,
} from "../src/application/agent/mentions";

function tripWithUsers(): Trip {
  const snap = structuredClone(seedTrips()[0]!.snapshot);
  snap.members = snap.members.map((m) => ({
    ...m,
    userId: `user-${m.id}`,
  }));
  return Trip.fromSnapshot(snap);
}

describe("agent mentions", () => {
  it("detects @agent case-insensitively", () => {
    expect(containsAgentMention("@agent help")).toBe(true);
    expect(containsAgentMention("@Agent help")).toBe(true);
    expect(containsAgentMention("hello")).toBe(false);
  });

  it("parses member mentions by display name and excludes the author", () => {
    const trip = tripWithUsers();
    const lynn = trip.toSnapshot().members.find((m) => m.id === "lynn")!;

    const ids = parseMemberMentions(
      "@Aiko Tanaka can you review this? cc @Marco Bailey",
      trip,
      lynn.userId!,
    );
    expect(ids).toEqual(
      expect.arrayContaining(["user-aiko", "user-marco"]),
    );
    expect(ids).not.toContain(lynn.userId);
  });

  it("does not match partial name prefixes", () => {
    const trip = tripWithUsers();
    const author = trip.toSnapshot().members[0]!;
    const ids = parseMemberMentions("@Lynn", trip, author.userId!);
    expect(ids).toHaveLength(0);
  });

  it("builds message parts with a mentions block", () => {
    const trip = tripWithUsers();
    const author = trip.toSnapshot().members.find((m) => m.id === "lynn")!;
    const parts = buildUserMessageParts(
      "@Aiko Tanaka ping",
      trip,
      author.userId!,
    );
    expect(parts[0]).toEqual({ type: "text", text: "@Aiko Tanaka ping" });
    expect(mentionedUserIdsFromParts(parts)).toEqual(["user-aiko"]);
  });
});
