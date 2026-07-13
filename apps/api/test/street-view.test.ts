import { describe, expect, it, vi } from "vitest";
import { StreetViewError, StreetViewService } from "../src/application/street-view";
import type { StreetViewProvider } from "../src/domain/street-view";
import { buildStreetViewReadTools } from "../src/infrastructure/ai/agent-model.ai-sdk";
import { MapillaryStreetViewProvider } from "../src/infrastructure/street-view/mapillary/mapillary-provider";

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
});

describe("MapillaryStreetViewProvider", () => {
  it("merges bounded panorama and general candidate lanes without leaking the token", async () => {
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
  });

  it("returns partial candidates when one lane fails and throws when both fail", async () => {
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

    const search = tools.streetViewSearch as unknown as {
      execute: (input: { lat: number; lng: number }) => Promise<unknown>;
    };
    await expect(search.execute({ lat: 10, lng: 20 })).resolves.toMatchObject({
      outcome: "found",
      panoramaAvailable: false,
    });
    expect(info).toHaveBeenCalledWith(
      "Street-view search completed",
      expect.objectContaining({
        event: "street_view.search_completed",
        outcome: "found",
        completeness: "complete",
        candidateCount: 1,
        panoramaCount: 0,
      }),
    );

    const inspect = tools.streetViewInspect as unknown as {
      execute: (input: { imageId: string }) => Promise<{ id: string; supports360: boolean }>;
      toModelOutput: (input: {
        output: { id: string; supports360: boolean };
      }) => Promise<unknown>;
    };
    const output = await inspect.execute({ imageId: "static" });
    expect(await inspect.toModelOutput({ output })).toMatchObject({
      type: "content",
      value: [
        { type: "text" },
        { type: "file", mediaType: "image/jpeg", data: { type: "data" } },
      ],
    });
    await expect(inspect.execute({ imageId: "pano" })).rejects.toMatchObject({
      code: "street_view_panorama_inspection_forbidden",
    });
    expect(readPreview).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });
});
