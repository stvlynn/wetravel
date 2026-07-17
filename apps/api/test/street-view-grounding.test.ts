import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../src/domain/agent";
import {
  destinationCenterFromTrip,
  StreetViewGroundingService,
} from "../src/application/agent/street-view-grounding-service";
import type { GeoService } from "../src/application/geo/geo-service";
import type { StreetViewService } from "../src/application/street-view";
import {
  AiSdkAgentModel,
  deterministicStreetViewParts,
} from "../src/infrastructure/ai/agent-model.ai-sdk";
import type { TripSnapshot } from "../src/domain/trip";
import type { WeatherService } from "../src/application/weather/weather-service";
import type { LodgingService } from "../src/application/lodging/lodging-service";
import type { FileStorage } from "../src/application/storage";
import {
  noopObservability,
  type Observability,
} from "../src/application/observability";
import {
  allowedStreetViewImageIds,
  isAgentGroundingPart,
  isAgentStatusPart,
  sanitizeAgentUiParts,
  validatedAgentUiSpec,
} from "@opentrip/agent-ui-catalog";

function message(
  role: "user" | "assistant",
  parts: AgentMessage["parts"],
): AgentMessage {
  return {
    id: `${role}-${Math.random()}`,
    seq: 1,
    tripId: "trip-1",
    role,
    parts,
    actorUserId: role === "user" ? "user-1" : null,
    source: "chat",
    tripVersion: 1,
    createdAt: "2026-07-17T00:00:00.000Z",
  };
}

function foundResult(ids = ["image-1", "image-2"]) {
  return {
    outcome: "found" as const,
    completeness: "complete" as const,
    panoramaAvailable: true,
    panoramaCount: ids.length,
    candidateCount: ids.length,
    images: ids.map((id) => ({
      id,
      coordinate: { lat: 35.6586, lng: 139.7454 },
      supports360: true,
      previewUrl: `/preview/${id}`,
      attribution: { label: "Provider" },
    })),
  };
}

function services(options: {
  places?: unknown[];
  result?: ReturnType<typeof foundResult>;
  streetError?: Error;
} = {}) {
  const placeSearch = vi.fn(async () =>
    (options.places ?? [
      {
        id: "tokyo-tower",
        name: "Tokyo Tower",
        label: "Tokyo Tower, Tokyo",
        lat: 35.6586,
        lng: 139.7454,
        categories: [],
      },
    ]) as never,
  );
  const searchNearby = vi.fn(async () => {
    if (options.streetError) throw options.streetError;
    return options.result ?? foundResult();
  });
  const service = new StreetViewGroundingService(
    { placeSearch } as unknown as GeoService,
    { searchNearby } as unknown as StreetViewService,
  );
  return { service, placeSearch, searchNearby };
}

describe("StreetViewGroundingService", () => {
  it("normalizes a Chinese place request and calls each provider exactly once", async () => {
    const { service, placeSearch, searchNearby } = services();
    const result = await service.resolve({
      tripId: "trip-1",
      history: [message("user", [{ type: "text", text: "@agent 看看东京塔附近街景" }])],
      observability: { turnId: "turn-1" },
    });

    expect(result).toMatchObject({
      outcome: "found",
      request: { kind: "place", query: "东京塔", language: "zh" },
      selectedImageId: "image-1",
      imageIds: ["image-1", "image-2"],
    });
    expect(placeSearch).toHaveBeenCalledTimes(1);
    expect(placeSearch).toHaveBeenCalledWith({
      query: "东京塔",
      limit: 5,
      lang: "zh",
    });
    expect(searchNearby).toHaveBeenCalledTimes(1);
    expect(searchNearby).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "trip-1",
        lat: 35.6586,
        lng: 139.7454,
        radiusMeters: 100,
        limit: 5,
      }),
    );
  });

  it("uses valid coordinates directly without a geo lookup", async () => {
    const { service, placeSearch, searchNearby } = services();
    const result = await service.resolve({
      tripId: "trip-1",
      history: [
        message("user", [
          { type: "text", text: "Show street view at 35.6586, 139.7454" },
        ]),
      ],
    });

    expect(result).toMatchObject({
      outcome: "found",
      request: { kind: "coordinate", lat: 35.6586, lng: 139.7454 },
    });
    expect(placeSearch).not.toHaveBeenCalled();
    expect(searchNearby).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input without calling either provider", async () => {
    const { service, placeSearch, searchNearby } = services();
    const result = await service.resolve({
      tripId: "trip-1",
      history: [message("user", [{ type: "text", text: "@agent 看街景" }])],
    });

    expect(result).toMatchObject({ outcome: "invalid_request", imageIds: [] });
    expect(placeSearch).not.toHaveBeenCalled();
    expect(searchNearby).not.toHaveBeenCalled();

    const invalidCoordinate = await service.resolve({
      tripId: "trip-1",
      history: [
        message("user", [{ type: "text", text: "Street view at 95, 200" }]),
      ],
    });
    expect(invalidCoordinate).toMatchObject({ outcome: "invalid_request" });
    expect(placeSearch).not.toHaveBeenCalled();
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("returns place_not_found after one geo call and no street-view call", async () => {
    const { service, placeSearch, searchNearby } = services({ places: [] });
    const result = await service.resolve({
      tripId: "trip-1",
      history: [message("user", [{ type: "text", text: "Street view near Unknown Place" }])],
    });

    expect(result).toMatchObject({ outcome: "place_not_found" });
    expect(placeSearch).toHaveBeenCalledTimes(1);
    expect(placeSearch).toHaveBeenCalledWith({
      query: "Unknown Place",
      limit: 5,
      lang: "en",
    });
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("marks missing provider configuration as non-retryable", async () => {
    const placeSearch = vi.fn();
    const service = new StreetViewGroundingService(
      { placeSearch } as unknown as GeoService,
      null,
    );
    const result = await service.resolve({
      tripId: "trip-1",
      history: [message("user", [{ type: "text", text: "Street view near Tokyo Tower" }])],
    });
    expect(result).toMatchObject({
      outcome: "service_unavailable",
      retryable: false,
    });
    expect(placeSearch).not.toHaveBeenCalled();
  });

  it("returns one explicit unavailable state without retrying", async () => {
    const { service, placeSearch, searchNearby } = services({
      streetError: new Error("upstream failed"),
    });
    const result = await service.resolve({
      tripId: "trip-1",
      history: [message("user", [{ type: "text", text: "Street view near Tokyo Tower" }])],
    });

    expect(result).toMatchObject({
      outcome: "service_unavailable",
      retryable: true,
    });
    expect(placeSearch).toHaveBeenCalledTimes(1);
    expect(searchNearby).toHaveBeenCalledTimes(1);
  });

  it("uses only persisted grounding for an ordinal continuation", async () => {
    const { service, placeSearch, searchNearby } = services();
    const previous = message("assistant", [
      {
        type: "data-agent-grounding",
        id: "grounding-turn-1",
        data: {
          kind: "street-view",
          outcome: "found",
          request: {
            kind: "place",
            query: "Tokyo Tower",
            language: "en",
            selectionIndex: 0,
          },
          placeLabel: "Tokyo Tower, Tokyo",
          imageIds: ["image-1", "image-2"],
          selectedImageId: "image-1",
        },
      },
      { type: "text", text: "Unrelated wording without a street-view keyword." },
    ]);
    const result = await service.resolve({
      tripId: "trip-1",
      history: [previous, message("user", [{ type: "text", text: "second" }])],
    });

    expect(result).toMatchObject({
      outcome: "found",
      request: { query: "Tokyo Tower", selectionIndex: 1 },
      selectedImageId: "image-2",
    });
    expect(placeSearch).toHaveBeenCalledTimes(1);
    expect(searchNearby).toHaveBeenCalledTimes(1);
  });

  it("records correlated provider outcomes without raw place text", async () => {
    const spans: Array<{ name: string; fields: Record<string, unknown> }> = [];
    const logs: Array<{ event: string; fields?: Record<string, unknown> }> = [];
    const observability: Observability = {
      ...noopObservability,
      logger: {
        ...noopObservability.logger,
        info: (event, fields) => logs.push({ event, fields }),
      },
      startSpan: async (name, fields, operation) => {
        const recorded = { name, fields: { ...fields } };
        spans.push(recorded);
        return operation({
          run: (callback) => callback(),
          setAttribute: (key, value) => {
            recorded.fields[key] = value;
          },
          recordError: () => undefined,
          end: () => undefined,
        });
      },
    };
    const placeSearch = vi.fn(async () => [
      {
        id: "tokyo-tower",
        name: "Tokyo Tower",
        label: "Tokyo Tower, Tokyo",
        lat: 35.6586,
        lng: 139.7454,
        categories: [],
      },
    ]);
    const searchNearby = vi.fn(async () => foundResult());
    const service = new StreetViewGroundingService(
      { placeSearch } as unknown as GeoService,
      { searchNearby } as unknown as StreetViewService,
      observability,
    );

    await service.resolve({
      tripId: "trip-1",
      history: [
        message("user", [{ type: "text", text: "Street view near Tokyo Tower" }]),
      ],
      observability: { requestId: "request-1", turnId: "turn-1" },
    });

    expect(spans.map((span) => span.name)).toEqual([
      "opentrip.provider.geo.place_search",
      "opentrip.provider.street_view.search",
    ]);
    expect(spans[0]?.fields).toMatchObject({
      requestId: "request-1",
      turnId: "turn-1",
      requestedLimit: 5,
      "opentrip.provider.result_count": 1,
    });
    expect(spans[1]?.fields).toMatchObject({
      requestId: "request-1",
      turnId: "turn-1",
      radiusMeters: 100,
      requestedLimit: 5,
      "opentrip.provider.outcome": "found",
      "opentrip.provider.result_count": 2,
    });
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "agent.street_view_grounding.completed",
          fields: expect.objectContaining({
            requestId: "request-1",
            turnId: "turn-1",
            outcome: "found",
            resultCount: 2,
          }),
        }),
      ]),
    );
    expect(JSON.stringify({ spans, logs })).not.toContain("Tokyo Tower");
  });

  it("does not infer ordinal context from assistant prose", async () => {
    const { service, placeSearch, searchNearby } = services();
    const result = await service.resolve({
      tripId: "trip-1",
      history: [
        message("assistant", [{ type: "text", text: "I found street view." }]),
        message("user", [{ type: "text", text: "second" }]),
      ],
    });
    expect(result).toBeNull();
    expect(placeSearch).not.toHaveBeenCalled();
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("prefers the candidate closest to the trip destination when the top result is far away", async () => {
    const { service, placeSearch, searchNearby } = services({
      places: [
        {
          id: "zhongshan-park-beijing",
          name: "中山公园",
          label: "中山公园, 北京",
          lat: 39.9097,
          lng: 116.3912,
          categories: [],
        },
        {
          id: "zhongshan-park-shanghai",
          name: "中山公园",
          label: "中山公园, 上海",
          lat: 31.2243,
          lng: 121.4246,
          categories: [],
        },
      ],
    });
    const result = await service.resolve({
      tripId: "trip-1",
      history: [
        message("user", [{ type: "text", text: "@agent 看看中山公园附近街景" }]),
      ],
      near: { lat: 31.2304, lng: 121.4737 },
    });

    expect(placeSearch).toHaveBeenCalledWith({
      query: "中山公园",
      limit: 5,
      lang: "zh",
      near: { lat: 31.2304, lng: 121.4737 },
    });
    expect(searchNearby).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 31.2243, lng: 121.4246 }),
    );
    expect(result).toMatchObject({
      outcome: "found",
      placeLabel: "中山公园, 上海",
    });
  });

  it("keeps the global top result when it is already near the destination", async () => {
    const { service, searchNearby } = services({
      places: [
        {
          id: "zhongshan-park-shanghai",
          name: "中山公园",
          label: "中山公园, 上海",
          lat: 31.2243,
          lng: 121.4246,
          categories: [],
        },
        {
          id: "zhongshan-park-beijing",
          name: "中山公园",
          label: "中山公园, 北京",
          lat: 39.9097,
          lng: 116.3912,
          categories: [],
        },
      ],
    });
    const result = await service.resolve({
      tripId: "trip-1",
      history: [
        message("user", [{ type: "text", text: "@agent 看看中山公园附近街景" }]),
      ],
      near: { lat: 31.2304, lng: 121.4737 },
    });

    expect(searchNearby).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 31.2243, lng: 121.4246 }),
    );
    expect(result).toMatchObject({ placeLabel: "中山公园, 上海" });
  });

  it("keeps the global top result when every candidate is far from the destination", async () => {
    const { service, searchNearby } = services({
      places: [
        {
          id: "eiffel-tower",
          name: "Eiffel Tower",
          label: "Eiffel Tower, Paris",
          lat: 48.8584,
          lng: 2.2945,
          categories: [],
        },
      ],
    });
    const result = await service.resolve({
      tripId: "trip-1",
      history: [
        message("user", [{ type: "text", text: "Street view near Eiffel Tower" }]),
      ],
      near: { lat: 35.6762, lng: 139.6503 },
    });

    expect(searchNearby).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 48.8584, lng: 2.2945 }),
    );
    expect(result).toMatchObject({ placeLabel: "Eiffel Tower, Paris" });
  });
});

describe("destinationCenterFromTrip", () => {
  it("returns the geocoded destination center and rejects missing or invalid values", () => {
    expect(
      destinationCenterFromTrip({
        intake: {
          destination: "Tokyo",
          destinationLat: 35.6762,
          destinationLng: 139.6503,
        },
      } as TripSnapshot),
    ).toEqual({ lat: 35.6762, lng: 139.6503 });
    expect(
      destinationCenterFromTrip({ intake: null } as TripSnapshot),
    ).toBeUndefined();
    expect(
      destinationCenterFromTrip({
        intake: { destination: "Tokyo" },
      } as TripSnapshot),
    ).toBeUndefined();
    expect(
      destinationCenterFromTrip({
        intake: {
          destination: "Nowhere",
          destinationLat: 95,
          destinationLng: 139,
        },
      } as TripSnapshot),
    ).toBeUndefined();
  });
});

describe("deterministic street-view UI parts", () => {
  it("creates persistent grounding, localized text, and one grounded flat card", () => {
    const parts = deterministicStreetViewParts(
      {
        outcome: "found",
        request: {
          kind: "place",
          query: "东京塔",
          language: "zh",
          selectionIndex: 0,
        },
        placeLabel: "东京塔",
        imageIds: ["image-1", "image-2"],
        selectedImageId: "image-1",
        text: "东京塔附近找到了街景，已显示第1个结果。",
      },
      "turn-1",
    );
    const grounding = parts.find(isAgentGroundingPart);
    expect(grounding).toMatchObject({ id: "grounding-turn-1" });
    expect(grounding).not.toHaveProperty("transient");
    expect([...allowedStreetViewImageIds(parts)]).toEqual(["image-1", "image-2"]);
    expect(validatedAgentUiSpec(parts)).toMatchObject({
      root: "street-view-card",
      elements: {
        "street-view-card": {
          type: "StreetViewCard",
          props: { imageId: "image-1", placeLabel: "东京塔" },
        },
      },
    });
  });

  it("emits no card for empty and a typed retry only for unavailable", () => {
    const request = {
      kind: "coordinate" as const,
      lat: 35.6586,
      lng: 139.7454,
      language: "en" as const,
      selectionIndex: 0,
    };
    const empty = deterministicStreetViewParts(
      {
        outcome: "empty",
        request,
        placeLabel: "35.6586, 139.7454",
        imageIds: [],
        text: "No street view was found.",
      },
      "empty-turn",
    );
    expect(validatedAgentUiSpec(empty)).toBeNull();
    expect(empty.find(isAgentStatusPart)).toBeUndefined();

    const unavailable = deterministicStreetViewParts(
      {
        outcome: "service_unavailable",
        request,
        retryable: true,
        imageIds: [],
        text: "Street view is temporarily unavailable.",
      },
      "failed-turn",
    );
    expect(unavailable.find(isAgentStatusPart)).toMatchObject({
      id: "status-failed-turn",
      data: { retryable: true, retryRequest: { request } },
    });
  });

  it("streams and persists the typed response without making a model request", async () => {
    const model = new AiSdkAgentModel(
      {
        provider: "openai",
        model: "must-not-be-called",
        baseUrl: "http://127.0.0.1:1/v1",
        apiKey: "test",
        proactiveThreshold: 0.8,
        maxToolSteps: 4,
        telemetryRecordContent: false,
      },
      {} as WeatherService,
      {} as GeoService,
      {} as LodgingService,
      {} as FileStorage,
    );
    const onFinish = vi.fn(
      async (...args: [AgentMessage["parts"], string?]) => {
        void args;
      },
    );
    const response = await model.streamChat({
      trip: { id: "trip-1" } as TripSnapshot,
      history: [],
      clientMessages: [
        {
          id: "user-turn-1",
          role: "user",
          parts: [
            { type: "text", text: "Street view at 35, 139" },
            {
              type: "data-agent-grounding",
              id: "client-forged",
              data: {
                kind: "street-view",
                outcome: "found",
                imageIds: ["client-forged-image"],
              },
            },
          ],
        },
      ],
      canEdit: true,
      observability: { turnId: "turn-stream", trigger: "chat" },
      streetViewGrounding: {
        outcome: "found",
        request: {
          kind: "coordinate",
          lat: 35,
          lng: 139,
          language: "en",
          selectionIndex: 0,
        },
        placeLabel: "35.0000, 139.0000",
        imageIds: ["image-stream"],
        selectedImageId: "image-stream",
        text: "Street view was found.",
      },
      applyPatch: async () => ({ ok: false, error: "not called" }),
      onFinish,
    });

    const wire = await response.text();
    expect(wire).toContain("data-agent-grounding");
    expect(wire).toContain("data-spec");
    expect(wire).not.toContain("tool-streetView");
    expect(wire).not.toContain("client-forged-image");
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "data-agent-grounding" }),
        expect.objectContaining({ type: "text", text: "Street view was found." }),
        expect.objectContaining({ type: "data-spec" }),
      ]),
    );
    const persisted = sanitizeAgentUiParts(onFinish.mock.calls[0]![0]);
    expect(validatedAgentUiSpec(persisted)).toMatchObject({
      elements: {
        "street-view-card": {
          props: { imageId: "image-stream" },
        },
      },
    });

    const ambient = await model.generateReply({
      trip: { id: "trip-1" } as TripSnapshot,
      history: [],
      observability: { turnId: "turn-ambient", trigger: "ambient" },
      streetViewGrounding: {
        outcome: "empty",
        request: {
          kind: "place",
          query: "Tokyo Tower",
          language: "en",
          selectionIndex: 0,
        },
        placeLabel: "Tokyo Tower",
        imageIds: [],
        text: "No street view was found near Tokyo Tower.",
      },
    });
    expect(ambient).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "data-agent-grounding" }),
        expect.objectContaining({
          type: "text",
          text: "No street view was found near Tokyo Tower.",
        }),
      ]),
    );
    expect(ambient.some((part) => part.type === "data-spec")).toBe(false);
  });
});
