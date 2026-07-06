import { describe, expect, it } from "vitest";
import { clamp, snap } from "./splitter";

describe("clamp", () => {
  it("returns the value when inside the range", () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it("clamps to the minimum", () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it("clamps to the maximum", () => {
    expect(clamp(120, 0, 100)).toBe(100);
  });
});

describe("snap", () => {
  it("snaps to the nearest step above the minimum", () => {
    expect(snap(12, 10, 0)).toBe(10);
    expect(snap(18, 10, 0)).toBe(20);
  });

  it("returns the minimum when value is below the first step", () => {
    expect(snap(3, 10, 0)).toBe(0);
  });

  it("handles non-zero minimums", () => {
    expect(snap(23, 5, 10)).toBe(25);
    expect(snap(21, 5, 10)).toBe(20);
  });
});
