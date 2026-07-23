import { describe, expect, it } from "vitest";
import {
  isKnownPath,
  matchInviteToken,
  matchJournalEntryId,
  matchTripId,
} from "./router";

describe("route matchers", () => {
  it("extracts trip ids", () => {
    expect(matchTripId("/trips/abc")).toBe("abc");
    expect(matchTripId("/trips/a%20b")).toBe("a b");
    expect(matchTripId("/trips")).toBeNull();
    expect(matchTripId("/journal/abc")).toBeNull();
  });

  it("extracts invite tokens", () => {
    expect(matchInviteToken("/invite/tok")).toBe("tok");
    expect(matchInviteToken("/invite")).toBeNull();
  });

  it("extracts travelogue entry ids", () => {
    expect(matchJournalEntryId("/journal/entry-1")).toBe("entry-1");
    expect(matchJournalEntryId("/journal")).toBeNull();
    expect(matchJournalEntryId("/journal/a/b")).toBeNull();
  });
});

describe("isKnownPath", () => {
  it("accepts the authenticated home hub surfaces", () => {
    expect(isKnownPath("/")).toBe(true);
    expect(isKnownPath("/today")).toBe(true);
    expect(isKnownPath("/journal")).toBe(true);
  });

  it("accepts travelogue reading routes", () => {
    expect(isKnownPath("/journal/entry-1")).toBe(true);
  });

  it("accepts auth, miniapp, trip, and invite routes", () => {
    expect(isKnownPath("/signin")).toBe(true);
    expect(isKnownPath("/miniapp")).toBe(true);
    expect(isKnownPath("/trips/abc")).toBe(true);
    expect(isKnownPath("/invite/tok")).toBe(true);
  });

  it("rejects unknown paths", () => {
    expect(isKnownPath("/nope")).toBe(false);
    expect(isKnownPath("/journal/a/b")).toBe(false);
    expect(isKnownPath("/trips")).toBe(false);
  });
});
