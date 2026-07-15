import { describe, expect, it, vi } from "vitest";
import { StreetViewError, StreetViewService } from "../src/application/street-view";
import type { StreetViewProvider } from "../src/domain/street-view";
import {
  buildStreetViewReadTools,
  StreetViewToolPolicy,
} from "../src/infrastructure/ai/agent-model.ai-sdk";
import { MapillaryStreetViewProvider } from "../src/infrastructure/street-view/mapillary/mapillary-provider";
import { MemoryStreetViewCache } from "../src/infrastructure/street-view/memory-street-view-cache";

function provider(overrides: Partial<StreetViewProvider> = {}): StreetViewProvider {
  return {
    searchNearby: async () => ({ images: [], completeness: "complete" }),
    getImage: async () => null,
    readPreview: async () => ({ bytes: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg" }),
    getViewerConfig: () => ({ provider: "test", accessToken: "token" }),
    ...overrides,
  };
}

function image(
  id: string,
  lat: number,
  options: { supports360?: boolean; capturedAt?: string } = {},
) {
  return {
    id,
    coordinate: { lat, lng: 20 },
    supports360: options.supports360 ?? false,
    ...(options.capturedAt ? { capturedAt: options.capturedAt } : {}),
    previewSource: `secret-${id}`,
    attribution: { label: "Provider" },
  };
}

function oversizedRegionResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 1,
        message: "Please reduce the amount of data you're asking for, then retry your request",
      },
    }),
    { status: 500, headers: { "content-type": "application/json" } },
  );
}

describe("StreetViewService", () => {
  it("filters to the circular radius and ranks panoramas deterministically", async () => {
    const service = new StreetViewService(
      provider({
        searchNearby: async () => ({
          completeness: "complete",
          images: [
            image("outside-bbox-corner", 10.001),
            image("static-near", 10.0001, { capturedAt: "2026-01-01T00:00:00.000Z" }),
            image("pano-old", 10.0003, {
              supports360: true,
              capturedAt: "2025-01-01T00:00:00.000Z",
            }),
            image("pano-new", 10.0003, {
              supports360: true,
              capturedAt: "2026-01-01T00:00:00.000Z",
            }),
          ],
        }),
      }),
    );

    const result = await service.searchNearby({
      tripId: "trip/a",
      lat: 10,
      lng: 20,
      radiusMeters: 100,
    });

    expect(result).toMatchObject({
      outcome: "found",
      completeness: "complete",
      panoramaCount: 2,
      panoramaAvailable: true,
      candidateCount: 3,
    });
    expect(result.images.map((item) => item.id)).toEqual([
      "pano-new",
      "pano-old",
      "static-near",
    ]);
    expect(result.images[0]!.previewUrl).toBe(
      "/api/trips/trip%2Fa/street-view/images/pano-new/preview",
    );
    expect(JSON.stringify(result)).not.toContain("secret-pano-new");
  });

  it("returns an explicit partial empty outcome", async () => {
    const service = new StreetViewService(
      provider({ searchNearby: async () => ({ images: [], completeness: "partial" }) }),
    );

    await expect(
      service.searchNearby({ tripId: "trip", lat: 10, lng: 20 }),
    ).resolves.toEqual({
      outcome: "empty",
      completeness: "partial",
      panoramaAvailable: false,
      panoramaCount: 0,
      candidateCount: 0,
      images: [],
    });
  });

  it("rejects panorama inspection before reading preview bytes", async () => {
    const readPreview = vi.fn();
    const service = new StreetViewService(
      provider({
        getImage: async () => image("pano", 10, { supports360: true }),
        readPreview,
      }),
    );

    await expect(service.getInspectableImage("trip", "pano")).rejects.toMatchObject({
      code: "street_view_panorama_inspection_forbidden",
    });
    expect(readPreview).not.toHaveBeenCalled();
  });

  it("hydrates metadata and preview from the shared cache", async () => {
    const getImage = vi.fn(async () => image("cached", 10));
    const readPreview = vi.fn(async () => ({
      bytes: new Uint8Array([7, 8, 9]),
      mediaType: "image/jpeg" as const,
    }));
    const service = new StreetViewService(
      provider({
        searchNearby: async () => ({
          completeness: "complete",
          images: [image("cached", 10)],
        }),
        getImage,
        readPreview,
      }),
      new MemoryStreetViewCache(),
    );

    await service.searchNearby({ tripId: "trip", lat: 10, lng: 20 });
    await expect(service.getImage("trip", "cached")).resolves.toMatchObject({
      id: "cached",
    });
    await service.readPreview("cached");
    await service.readPreview("cached");
    expect(getImage).not.toHaveBeenCalled();
    expect(readPreview).toHaveBeenCalledTimes(1);
  });

  it("expires memory cache entries after fifteen minutes", async () => {
    let now = 0;
    const cache = new MemoryStreetViewCache({ now: () => now });
    await cache.putImage(image("expires", 10));
    expect(await cache.getImage("expires")).not.toBeNull();
    now = 15 * 60 * 1_000;
    expect(await cache.getImage("expires")).toBeNull();
  });
});

describe("MapillaryStreetViewProvider", () => {
  it("merges bounded panorama and general candidate lanes without leaking the token", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      const isPanoramaLane = url.searchParams.get("image_type") === "pano";
      return new Response(
        JSON.stringify({
          data: isPanoramaLane
            ? [
                {
                  id: "pano",
                  captured_at: 1_700_000_000_000,
                  computed_compass_angle: 90,
                  computed_geometry: { coordinates: [20, 10.0002] },
                  is_pano: true,
                  thumb_1024_url: "https://images.example/pano.jpg",
                },
              ]
            : [
                {
                  id: "static",
                  computed_geometry: { coordinates: [20, 10.0001] },
                  is_pano: false,
                  thumb_1024_url: "https://images.example/static.jpg",
                },
                {
                  id: "pano",
                  computed_geometry: { coordinates: [20, 10.0002] },
                  is_pano: true,
                  thumb_1024_url: "https://images.example/pano.jpg",
                },
              ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const adapter = new MapillaryStreetViewProvider(
      "secret-token",
      5_000,
      fetchMock as unknown as typeof fetch,
    );

    const result = await adapter.searchNearby({ lat: 10, lng: 20, radiusMeters: 100, limit: 5 });

    expect(result.completeness).toBe("complete");
    expect(result.images.map((item) => item.id)).toEqual(["pano", "static"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requested = fetchMock.mock.calls.map((call) => new URL(String(call[0])));
    expect(requested.some((url) => url.searchParams.get("image_type") === "pano")).toBe(true);
    expect(requested.every((url) => url.searchParams.get("limit") === "20")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(info).toHaveBeenCalledWith(
      "Mapillary street-view search completed",
      expect.objectContaining({
        event: "street_view.mapillary_search_completed",
        initialRegionCount: 1,
        attemptedRegionCount: 2,
        splitRegionCount: 0,
        completeness: "complete",
      }),
    );
    info.mockRestore();
  });

  it("subdivides only oversized Mapillary regions and deduplicates their results", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      const bbox = url.searchParams.get("bbox")!.split(",").map(Number);
      const height = bbox[3]! - bbox[1]!;
      if (height > 0.002) return oversizedRegionResponse();
      const isPanoramaLane = url.searchParams.get("image_type") === "pano";
      return new Response(
        JSON.stringify({
          data: [
            {
              id: isPanoramaLane ? "pano" : "static",
              computed_geometry: { coordinates: [20, 10] },
              is_pano: isPanoramaLane,
              thumb_1024_url: `https://images.example/${isPanoramaLane ? "pano" : "static"}.jpg`,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const adapter = new MapillaryStreetViewProvider(
      "token",
      5_000,
      fetchMock as unknown as typeof fetch,
    );

    await expect(
      adapter.searchNearby({ lat: 10, lng: 20, radiusMeters: 400, limit: 5 }),
    ).resolves.toMatchObject({
      completeness: "complete",
      images: [{ id: "pano" }, { id: "static" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(40);
    expect(info).toHaveBeenCalledWith(
      "Mapillary street-view search completed",
      expect.objectContaining({
        initialRegionCount: 4,
        attemptedRegionCount: 40,
        splitRegionCount: 8,
        completeness: "complete",
      }),
    );
    info.mockRestore();
  });

  it("returns partial candidates when one lane fails and throws when both fail", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const partlyFailingFetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      if (url.searchParams.get("image_type") === "pano") return new Response("no", { status: 500 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const partial = new MapillaryStreetViewProvider(
      "token",
      5_000,
      partlyFailingFetch as unknown as typeof fetch,
    );
    await expect(
      partial.searchNearby({ lat: 10, lng: 20, radiusMeters: 100, limit: 5 }),
    ).resolves.toEqual({ images: [], completeness: "partial" });

    const failed = new MapillaryStreetViewProvider(
      "token",
      5_000,
      vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
    );
    await expect(
      failed.searchNearby({ lat: 10, lng: 20, radiusMeters: 100, limit: 5 }),
    ).rejects.toBeInstanceOf(StreetViewError);
    info.mockRestore();
  });

  it("does not subdivide unrelated upstream errors", async () => {
    const fetchMock = vi.fn(async () => new Response("no", { status: 500 }));
    const adapter = new MapillaryStreetViewProvider(
      "token",
      5_000,
      fetchMock as unknown as typeof fetch,
    );

    await expect(
      adapter.searchNearby({ lat: 10, lng: 20, radiusMeters: 400, limit: 5 }),
    ).rejects.toMatchObject({ code: "street_view_upstream_error" });
    expect(fetchMock).toHaveBeenCalledTimes(16);
  });

  it("classifies provider authentication errors without retrying", async () => {
    const fetchMock = vi.fn(async () => new Response("no", { status: 401 }));
    const adapter = new MapillaryStreetViewProvider(
      "token",
      5_000,
      fetchMock as unknown as typeof fetch,
    );
    await expect(adapter.getImage("image")).rejects.toMatchObject({
      code: "street_view_provider_auth_error",
      upstreamStatus: 401,
      retryable: false,
      attempt: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds recursive subdivision with a shared request budget", async () => {
    const fetchMock = vi.fn(async () => oversizedRegionResponse());
    const adapter = new MapillaryStreetViewProvider(
      "token",
      5_000,
      fetchMock as unknown as typeof fetch,
    );

    await expect(
      adapter.searchNearby({ lat: 10, lng: 20, radiusMeters: 1_000, limit: 5 }),
    ).rejects.toBeInstanceOf(StreetViewError);
    expect(fetchMock).toHaveBeenCalledTimes(48);
  });
});

describe("street-view AI tools", () => {
  it("reports explicit search semantics and inspects only static images", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const readPreview = vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/jpeg" as const,
    }));
    const service = new StreetViewService(
      provider({
        searchNearby: async () => ({
          completeness: "complete",
          images: [image("static", 10)],
        }),
        getImage: async (id) =>
          image(id, 10, { supports360: id === "pano" }),
        readPreview,
      }),
    );
    const tools = buildStreetViewReadTools(service, "trip");
    expect(Object.keys(tools)).toEqual(["streetViewSearch", "streetViewInspect"]);

    type SearchOutput = {
      outcome: string;
      completeness: string;
      panoramaAvailable: boolean;
      panoramaCount: number;
      candidateCount: number;
      images: Array<{
        id: string;
        coordinate: { lat: number; lng: number };
        supports360: boolean;
        previewUrl: string;
        attribution: { label: string };
        distanceMeters?: number;
        headingDegrees?: number;
        capturedAt?: string;
      }>;
    };
    const search = tools.streetViewSearch as unknown as {
      execute: (input: { lat: number; lng: number }) => Promise<SearchOutput>;
      toModelOutput: (input: { output: SearchOutput }) => Promise<unknown>;
    };
    const searchResult = await search.execute({ lat: 10, lng: 20 });
    expect(searchResult).toMatchObject({
      outcome: "found",
      panoramaAvailable: false,
    });
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      level: "info",
      event: "street_view.search_completed",
      runtime: "node",
      outcome: "found",
      completeness: "complete",
      candidateCount: 1,
      panoramaCount: 0,
    });

    await expect(search.toModelOutput({ output: searchResult })).resolves.toMatchObject({
      type: "content",
      value: [
        { type: "text", text: expect.stringContaining("id=static") },
        { type: "file", mediaType: "image/jpeg", data: { type: "data" } },
      ],
    });
    expect(
      info.mock.calls
        .map((call) => JSON.parse(String(call[0])))
        .some(
          (entry) =>
            entry.event === "street_view.search_model_output" &&
            entry.previewAttach === "attached",
        ),
    ).toBe(true);

    const inspect = tools.streetViewInspect as unknown as {
      execute: (input: { imageId: string }) => Promise<{ id: string; supports360: boolean }>;
      toModelOutput: (input: {
        output: { id: string; supports360: boolean; attribution: { label: string } };
      }) => Promise<unknown>;
    };
    const output = await inspect.execute({ imageId: "static" });
    expect(await inspect.toModelOutput({ output: output as never })).toMatchObject({
      type: "content",
      value: [
        { type: "text", text: expect.stringContaining("id=static") },
        { type: "file", mediaType: "image/jpeg", data: { type: "data" } },
      ],
    });
    await expect(inspect.execute({ imageId: "pano" })).rejects.toMatchObject({
      code: "street_view_invalid_query",
    });
    expect(readPreview).toHaveBeenCalledTimes(2);
    info.mockRestore();
  });

  it("keeps search toModelOutput text-only for empty and panorama-only hits", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const readPreview = vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/jpeg" as const,
    }));
    const emptyService = new StreetViewService(
      provider({
        searchNearby: async () => ({ completeness: "complete", images: [] }),
        readPreview,
      }),
    );
    const emptyTools = buildStreetViewReadTools(emptyService, "trip-empty");
    const emptySearch = emptyTools.streetViewSearch as unknown as {
      execute: (input: { lat: number; lng: number }) => Promise<{
        outcome: string;
        completeness: string;
        panoramaAvailable: boolean;
        panoramaCount: number;
        candidateCount: number;
        images: unknown[];
      }>;
      toModelOutput: (input: { output: unknown }) => Promise<unknown>;
    };
    const emptyResult = await emptySearch.execute({ lat: 10, lng: 20 });
    await expect(
      emptySearch.toModelOutput({ output: emptyResult }),
    ).resolves.toMatchObject({
      type: "text",
      value: expect.stringContaining("No images returned"),
    });

    const panoService = new StreetViewService(
      provider({
        searchNearby: async () => ({
          completeness: "complete",
          images: [image("pano", 10, { supports360: true })],
        }),
        readPreview,
      }),
    );
    const panoTools = buildStreetViewReadTools(panoService, "trip-pano");
    const panoSearch = panoTools.streetViewSearch as unknown as {
      execute: (input: { lat: number; lng: number }) => Promise<{
        outcome: string;
        completeness: string;
        panoramaAvailable: boolean;
        panoramaCount: number;
        candidateCount: number;
        images: Array<{
          id: string;
          supports360: boolean;
          coordinate: { lat: number; lng: number };
          previewUrl: string;
          attribution: { label: string };
        }>;
      }>;
      toModelOutput: (input: { output: unknown }) => Promise<unknown>;
    };
    const panoResult = await panoSearch.execute({ lat: 10, lng: 20 });
    await expect(panoSearch.toModelOutput({ output: panoResult })).resolves.toMatchObject({
      type: "text",
      value: expect.stringContaining("panoramas are for the member viewer only"),
    });
    expect(readPreview).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("keeps search successful when preview bytes are unavailable", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const service = new StreetViewService(
      provider({
        searchNearby: async () => ({
          completeness: "complete",
          images: [image("static", 10)],
        }),
        readPreview: async () => {
          throw new StreetViewError(
            "street_view_upstream_error",
            "Preview upstream failed",
          );
        },
      }),
    );
    const tools = buildStreetViewReadTools(service, "trip-preview-fail");
    const search = tools.streetViewSearch as unknown as {
      execute: (input: { lat: number; lng: number }) => Promise<{
        outcome: string;
        completeness: string;
        panoramaAvailable: boolean;
        panoramaCount: number;
        candidateCount: number;
        images: Array<{
          id: string;
          supports360: boolean;
          coordinate: { lat: number; lng: number };
          previewUrl: string;
          attribution: { label: string };
        }>;
      }>;
      toModelOutput: (input: { output: unknown }) => Promise<unknown>;
    };
    const result = await search.execute({ lat: 10, lng: 20 });
    await expect(search.toModelOutput({ output: result })).resolves.toMatchObject({
      type: "text",
      value: expect.stringContaining("Preview unavailable"),
    });
    expect(
      info.mock.calls
        .map((call) => JSON.parse(String(call[0])))
        .some(
          (entry) =>
            entry.event === "street_view.search_model_output" &&
            entry.previewAttach === "preview_unavailable",
        ),
    ).toBe(true);
    info.mockRestore();
  });

  it("allows only one same-center widened retry after empty or partial output", () => {
    const policy = new StreetViewToolPolicy();
    const first = { lat: 35.039, lng: 135.729, radiusMeters: 100 };
    policy.validateSearch(first);
    policy.recordSearchSuccess(first, {
      outcome: "empty",
      completeness: "complete",
      images: [],
    });

    expect(() =>
      policy.validateSearch({ ...first, radiusMeters: 300 }),
    ).not.toThrow();

    const changedCenterPolicy = new StreetViewToolPolicy();
    changedCenterPolicy.validateSearch(first);
    changedCenterPolicy.recordSearchSuccess(first, {
      outcome: "empty",
      completeness: "complete",
      images: [],
    });
    expect(() =>
      changedCenterPolicy.validateSearch({
        ...first,
        lat: 35.04,
        radiusMeters: 300,
      }),
    ).toThrow(/same coordinates/);
  });

  it("reserves a search before I/O so parallel calls cannot reach the provider", () => {
    const policy = new StreetViewToolPolicy();
    const first = { lat: 35.039, lng: 135.729 };
    policy.validateSearch(first);
    expect(() => policy.validateSearch(first)).toThrow(/no longer available/);
  });

  it("removes street-view tools and adds truthful instructions after failure", () => {
    const policy = new StreetViewToolPolicy();
    policy.recordSearchFailure();
    const prepared = policy.prepareStep(
      ["placeSearch", "streetViewSearch", "streetViewInspect"],
      "Base instructions",
    );
    expect(prepared.activeTools).toEqual(["placeSearch"]);
    expect(prepared.instructions).toContain("one real street-view provider call");
    expect(prepared.instructions).toContain("Do not call another street-view tool");
  });
});
