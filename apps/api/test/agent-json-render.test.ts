import { describe, expect, it } from "vitest";
import { assistantPartsHaveContent } from "../src/application/agent/agent-service";

describe("agent json-render persistence", () => {
  it("persists replies that contain only a generated UI part", () => {
    expect(
      assistantPartsHaveContent([
        {
          type: "data-spec",
          data: {
            type: "patch",
            patch: { op: "add", path: "/root", value: "main" },
          },
        },
      ]),
    ).toBe(true);
  });

  it("does not treat malformed data parts as assistant content", () => {
    expect(
      assistantPartsHaveContent([
        { type: "data-spec", data: { type: "patch", patch: null } },
      ]),
    ).toBe(false);
  });

  it("persists a typed generated UI fallback", () => {
    expect(
      assistantPartsHaveContent([
        {
          type: "data-agent-status",
          id: "status-turn-1",
          data: {
            kind: "generated-ui-fallback",
            reason: "service_unavailable",
            retryable: true,
            retryRequest: {
              request: {
                kind: "place",
                query: "Tokyo Tower",
                language: "en",
                selectionIndex: 0,
              },
            },
          },
        },
      ]),
    ).toBe(true);
  });
});
