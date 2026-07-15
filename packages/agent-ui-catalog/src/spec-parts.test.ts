import { describe, expect, it } from "vitest";
import {
  allowedStreetViewImageIds,
  buildAgentUiRefinementPrompt,
  isAgentUiPart,
  refinableAgentUiSpec,
  sanitizeAgentUiParts,
  specFromAgentUiParts,
  safeAgentUiSpec,
  validatedAgentUiSpec,
} from "./spec-parts";

const validParts = [
  {
    type: "data-spec",
    data: {
      type: "flat",
      spec: {
        root: "text-1",
        elements: {
          "text-1": {
            type: "Text",
            props: { content: "Walk to the station", variant: "body" },
            children: [],
          },
        },
      },
    },
  },
] as const;

describe("agent UI spec parts", () => {
  it("recognizes and compiles a valid data-spec part", () => {
    expect(isAgentUiPart(validParts[0])).toBe(true);
    expect(specFromAgentUiParts(validParts)?.root).toBe("text-1");
    expect(validatedAgentUiSpec(validParts)?.elements["text-1"]?.type).toBe(
      "Text",
    );
  });

  it("rejects unknown components at the catalog boundary", () => {
    const parts = structuredClone(validParts) as unknown as Array<{
      type: string;
      data: { type: "flat"; spec: { root: string; elements: Record<string, unknown> } };
    }>;
    parts[0]!.data.spec.elements["text-1"] = {
      type: "Script",
      props: { source: "alert(1)" },
      children: [],
    };
    expect(validatedAgentUiSpec(parts)).toBeNull();
  });

  it("builds bounded official refinement prompts without truncating specs", () => {
    const spec = refinableAgentUiSpec(validParts);
    expect(spec?.root).toBe("text-1");
    const prompt = buildAgentUiRefinementPrompt("Make it shorter", spec!);
    expect(prompt).toContain("CURRENT UI STATE");
    expect(prompt).toContain("USER REQUEST: Make it shorter");
    expect(prompt).not.toContain("Previously generated interface");
    expect(refinableAgentUiSpec(validParts, 40)).toBeNull();
  });

  it("does not carry turn-grounded street-view cards into refinement", () => {
    const parts = [
      {
        type: "tool-streetViewSearch",
        state: "output-available",
        output: { outcome: "found", images: [{ id: "image-1" }] },
      },
      {
        type: "data-spec",
        data: {
          type: "flat",
          spec: {
            root: "view",
            elements: {
              view: {
                type: "StreetViewCard",
                props: { imageId: "image-1" },
                children: [],
              },
            },
          },
        },
      },
    ] as const;
    expect(refinableAgentUiSpec(parts)).toBeNull();
  });

  it("allows only validated, user-triggered catalog actions", () => {
    const base = {
      root: "button",
      elements: {
        button: {
          type: "ActionButton",
          props: { label: "Use this plan", variant: "primary" },
          children: [],
          on: {
            press: {
              action: "sendAgentFollowUp",
              params: { message: "Please write this plan to the trip" },
            },
          },
        },
      },
    };
    expect(safeAgentUiSpec(base)?.root).toBe("button");
    expect(
      safeAgentUiSpec({
        ...base,
        elements: {
          button: {
            ...base.elements.button,
            on: { press: { action: "navigate", params: { url: "https://x" } } },
          },
        },
      }),
    ).toBeNull();
  });

  it("rejects automatic watchers and keeps partial children renderable", () => {
    expect(
      safeAgentUiSpec({
        root: "button",
        elements: {
          button: {
            type: "ActionButton",
            props: { label: "Confirm" },
            children: [],
            watch: {
              "/ready": {
                action: "sendAgentFollowUp",
                params: { message: "Confirm" },
              },
            },
          },
        },
      }),
    ).toBeNull();

    const partial = safeAgentUiSpec({
      root: "card",
      elements: {
        card: {
          type: "Card",
          props: { title: "Draft" },
          children: ["not-streamed-yet"],
        },
      },
    });
    expect(partial?.elements.card?.children).toEqual([]);
  });

  it("accepts bounded street-view cards and open actions", () => {
    const spec = {
      root: "stack",
      elements: {
        stack: { type: "Stack", props: {}, children: ["view", "open"] },
        view: {
          type: "StreetViewCard",
          props: { imageId: "123456", placeLabel: "Temple gate" },
          children: [],
        },
        open: {
          type: "ActionButton",
          props: { label: "Open street view" },
          children: [],
          on: { press: { action: "openStreetView", params: { imageId: "123456" } } },
        },
      },
    };
    expect(
      safeAgentUiSpec(spec, { allowedStreetViewImageIds: new Set(["123456"]) })
        ?.elements.view?.type,
    ).toBe("StreetViewCard");
    expect(safeAgentUiSpec(spec)?.elements.view).toBeUndefined();
    const sanitized = safeAgentUiSpec({
        ...spec,
        elements: {
          ...spec.elements,
          open: {
            ...spec.elements.open,
            on: { press: { action: "openStreetView", params: { imageId: "../token" } } },
          },
        },
      }, { allowedStreetViewImageIds: new Set(["123456"]) });
    expect(sanitized?.elements.open).toBeUndefined();
    expect(sanitized?.elements.stack?.children).toEqual(["view"]);
  });

  it("trusts street-view ids only from successful tool outputs", () => {
    const parts = [
      {
        type: "tool-streetViewSearch",
        state: "output-available",
        output: {
          outcome: "found",
          images: [{ id: "trusted-search" }, { id: "also-trusted" }],
        },
      },
      {
        type: "tool-streetViewInspect",
        state: "output-available",
        output: { id: "trusted-inspect" },
      },
      {
        type: "tool-streetViewSearch",
        state: "output-error",
        output: { outcome: "found", images: [{ id: "not-trusted" }] },
      },
    ];
    expect([...allowedStreetViewImageIds(parts)]).toEqual([
      "trusted-search",
      "also-trusted",
      "trusted-inspect",
    ]);
  });

  it("flattens and removes ungrounded generated UI before persistence", () => {
    const parts = [
      ...validParts,
      {
        type: "data-spec",
        data: {
          type: "flat",
          spec: {
            root: "view",
            elements: {
              view: {
                type: "StreetViewCard",
                props: { imageId: "invented" },
                children: [],
              },
            },
          },
        },
      },
      { type: "text", text: "The prose remains" },
    ];
    const sanitized = sanitizeAgentUiParts(parts);
    expect(sanitized).toEqual([{ type: "text", text: "The prose remains" }]);
  });
});
