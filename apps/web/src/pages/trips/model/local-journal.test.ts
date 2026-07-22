import { describe, expect, it } from "vitest";
import {
  parseLocalJournalEntries,
  serializeLocalJournalEntries,
  type LocalJournalEntry,
} from "./local-journal";

const ENTRY: LocalJournalEntry = {
  id: "entry-1",
  title: "Rain in Kyoto",
  body: "We waited under the temple gate.",
  occurredAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
  publishedAt: null,
  tripId: "trip-1",
  visibility: "private",
  status: "draft",
  attachments: [],
};

describe("local journal persistence", () => {
  it("round-trips a versioned journal document", () => {
    expect(parseLocalJournalEntries(serializeLocalJournalEntries([ENTRY]))).toEqual([
      ENTRY,
    ]);
  });

  it("sorts entries with the newest moment first", () => {
    const older = {
      ...ENTRY,
      id: "entry-older",
      occurredAt: "2026-07-18T08:00:00.000Z",
    };

    expect(
      parseLocalJournalEntries(
        serializeLocalJournalEntries([older, ENTRY]),
      ).map((entry) => entry.id),
    ).toEqual(["entry-1", "entry-older"]);
  });

  it("migrates entries created before publication and attachments existed", () => {
    const legacy = JSON.stringify({
      version: 1,
      entries: [
        {
          id: ENTRY.id,
          title: ENTRY.title,
          body: ENTRY.body,
          occurredAt: ENTRY.occurredAt,
          updatedAt: ENTRY.updatedAt,
          tripId: ENTRY.tripId,
          visibility: ENTRY.visibility,
        },
      ],
    });

    expect(parseLocalJournalEntries(legacy)[0]).toMatchObject({
      status: "draft",
      publishedAt: null,
      attachments: [],
    });
  });

  it("ignores malformed and incompatible documents", () => {
    expect(parseLocalJournalEntries("not-json")).toEqual([]);
    expect(parseLocalJournalEntries('{"version":2,"entries":[]}')).toEqual([]);
    expect(
      parseLocalJournalEntries(
        '{"version":1,"entries":[{"id":"missing-fields"}]}',
      ),
    ).toEqual([]);
  });
});
