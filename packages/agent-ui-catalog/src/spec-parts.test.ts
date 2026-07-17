import { describe, expect, it } from "vitest";
import {
  allowedStreetViewImageIds,
  buildAgentUiRefinementPrompt,
  createAgentUiFallbackPart,
  isAgentUiPart,
  isAgentStatusPart,
  refinableAgentUiSpec,
  sanitizeAgentUiParts,
  specFromAgentUiParts,
  safeAgentUiSpec,
  validateAgentUiProtocol,
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
        type: "data-agent-grounding",
        id: "grounding-1",
        data: {
          kind: "street-view",
          outcome: "found",
          request: {
            kind: "place",
            query: "Temple gate",
            language: "en",
            selectionIndex: 0,
          },
          placeLabel: "Temple gate",
          imageIds: ["image-1"],
          selectedImageId: "image-1",
        },
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

  it("accepts only bounded application-grounded street-view cards", () => {
    const spec = {
      root: "view",
      elements: {
        view: {
          type: "StreetViewCard",
          props: { imageId: "123456", placeLabel: "Temple gate" },
          children: [],
        },
      },
    };
    expect(
      safeAgentUiSpec(spec, { allowedStreetViewImageIds: new Set(["123456"]) })
        ?.elements.view?.type,
    ).toBe("StreetViewCard");
    expect(safeAgentUiSpec(spec)).toBeNull();
  });

  it("trusts street-view ids only from successful grounding parts", () => {
    const parts = [
      {
        type: "data-agent-grounding",
        id: "grounding-found",
        data: {
          kind: "street-view",
          outcome: "found",
          request: {
            kind: "coordinate",
            lat: 35,
            lng: 139,
            language: "en",
            selectionIndex: 0,
          },
          placeLabel: "35.0000, 139.0000",
          imageIds: ["trusted-search", "also-trusted"],
          selectedImageId: "trusted-search",
        },
      },
      {
        type: "tool-streetViewSearch",
        state: "output-available",
        output: { outcome: "found", images: [{ id: "not-trusted" }] },
      },
    ];
    expect([...allowedStreetViewImageIds(parts)]).toEqual([
      "trusted-search",
      "also-trusted",
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

  it("rejects leaked flat specs and patches in the wrong fence", () => {
    expect(
      validateAgentUiProtocol([
        {
          type: "text",
          text: '```json\n{"root":"sv","elements":{"sv":{"type":"StreetViewCard","props":{"imageId":"invented"},"children":[]}}}\n```',
        },
      ]),
    ).toEqual({ valid: false, reason: "flat_spec_leak" });

    expect(
      validateAgentUiProtocol([
        {
          type: "text",
          text: '```json\n{"op":"add","path":"/root","value":"main"}\n```',
        },
      ]),
    ).toEqual({ valid: false, reason: "wrong_fence" });
  });

  it("rejects malformed residual spec fences but preserves ordinary JSON", () => {
    expect(
      validateAgentUiProtocol([
        { type: "text", text: "```spec\nnot-json\n```" },
      ]),
    ).toEqual({ valid: false, reason: "invalid_patch" });
    expect(
      validateAgentUiProtocol([
        { type: "text", text: '```json\n{"temperature":21}\n```' },
      ]),
    ).toEqual({ valid: true });
  });

  it("creates a typed localized fallback signal", () => {
    const part = createAgentUiFallbackPart("service_unavailable", {
      id: "status-turn-1",
      retryable: true,
      retryRequest: {
        request: {
          kind: "place",
          query: "Tokyo Tower",
          language: "en",
          selectionIndex: 0,
        },
      },
    });
    expect(isAgentStatusPart(part)).toBe(true);
    expect(part.data.retryable).toBe(true);
    expect(part.id).toBe("status-turn-1");
  });
});
