import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../src/domain/shared/errors";
import type {
  GeoPlace,
  GeoProvider,
  GeoRoute,
  GeoRouteMatrix,
  GeoReviewLookupResult,
} from "../src/domain/geo";
import { GeoService } from "../src/application/geo/geo-service";
import { loadConfig, type RawEnv } from "../src/infrastructure/config";
import {
  mapNominatimResult,
  mapOverpassElement,
  osmTravelProfile,
} from "../src/infrastructure/geo/osm/mappers";
import {
  mapGooglePlace,
  mapGoogleMatrixElement,
  parseDurationSeconds,
} from "../src/infrastructure/geo/google/mappers";
import { createGeoProvider } from "../src/infrastructure/geo/create-geo-provider";
import { OsmGeoProvider } from "../src/infrastructure/geo/osm/osm-geo-provider";
import { GoogleGeoProvider } from "../src/infrastructure/geo/google/google-geo-provider";
import { buildGeoReadTools } from "../src/infrastructure/ai/agent-model.ai-sdk";

function place(overrides: Partial<GeoPlace> = {}): GeoPlace {
  return {
    id: "node/1",
    name: "Cafe",
    label: "Cafe, Tokyo",
    lat: 35.68,
    lng: 139.76,
    categories: ["cafe"],
    ...overrides,
  };
}

function mockProvider(
  overrides: Partial<GeoProvider> = {},
): GeoProvider {
  return {
    placeSearch: vi.fn(async () => [place()]),
    placeNearby: vi.fn(async () => [place()]),
    placeDetail: vi.fn(async () => place()),
    routeCompute: vi.fn(async (): Promise<GeoRoute | null> => ({
      distanceMeters: 1000,
      durationSeconds: 600,
      legs: [{ distanceMeters: 1000, durationSeconds: 600 }],
      mode: "driving",
    })),
    routeMatrix: vi.fn(async (): Promise<GeoRouteMatrix> => ({
      mode: "driving",
      cells: [
        {
          originIndex: 0,
          destinationIndex: 0,
          condition: "ok",
          distanceMeters: 1000,
          durationSeconds: 600,
        },
      ],
    })),
    reviewLookup: vi.fn(async (): Promise<GeoReviewLookupResult> => ({
      placeId: "node/1",
      reviews: [],
      supported: false,
    })),
    ...overrides,
  };
}

const BASE_ENV: RawEnv = {
  DATABASE_URL: "postgres://example.test/opentrip",
  BETTER_AUTH_SECRET: "a-secure-test-secret-with-32-characters",
  BASE_URL: "https://api.example.test",
  STORAGE_BACKEND: "fs",
  STORAGE_ROOT: "/tmp/uploads",
};

describe("GeoService", () => {
  it("validates search query length", async () => {
    const service = new GeoService(mockProvider());
    await expect(service.placeSearch({ query: "a" })).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it("rejects invalid coordinates for nearby", async () => {
    const service = new GeoService(mockProvider());
    await expect(
      service.placeNearby({ lat: 200, lng: 0 }),
    ).rejects.toMatchObject({ code: "invalid_coordinates" });
  });

  it("normalizes place search results to DTOs", async () => {
    const provider = mockProvider();
    const service = new GeoService(provider);
    const result = await service.placeSearch({ query: "tokyo cafe" });
    expect(result).toEqual([
      expect.objectContaining({
        id: "node/1",
        name: "Cafe",
        lat: 35.68,
        lng: 139.76,
      }),
    ]);
    expect(provider.placeSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "tokyo cafe", limit: 8 }),
    );
  });

  it("rejects invalid travel modes", async () => {
    const service = new GeoService(mockProvider());
    await expect(
      service.routeCompute({
        waypoints: [
          { lat: 35.68, lng: 139.76 },
          { lat: 35.7, lng: 139.8 },
        ],
        mode: "hoverboard",
      }),
    ).rejects.toMatchObject({ code: "invalid_travel_mode" });
  });

  it("requires at least two waypoints for routing", async () => {
    const service = new GeoService(mockProvider());
    await expect(
      service.routeCompute({ waypoints: [{ lat: 1, lng: 2 }] }),
    ).rejects.toMatchObject({ code: "invalid_route_waypoints" });
  });

  it("passes through unsupported review lookups", async () => {
    const service = new GeoService(mockProvider());
    const result = await service.reviewLookup({ placeId: "node/1" });
    expect(result).toEqual({
      placeId: "node/1",
      reviews: [],
      supported: false,
    });
  });
});

describe("OSM mappers", () => {
  it("maps Nominatim jsonv2 payloads", () => {
    const mapped = mapNominatimResult({
      osm_type: "node",
      osm_id: 42,
      lat: "35.6812",
      lon: "139.7671",
      display_name: "Tokyo Station, Tokyo, Japan",
      name: "Tokyo Station",
      category: "railway",
      type: "station",
      address: {
        city: "Tokyo",
        country: "Japan",
        country_code: "jp",
      },
      extratags: { website: "https://example.test" },
      boundingbox: ["35.68", "35.69", "139.76", "139.77"],
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        id: "node/42",
        name: "Tokyo Station",
        lat: 35.6812,
        lng: 139.7671,
        website: "https://example.test",
        categories: ["railway", "station"],
      }),
    );
  });

  it("maps Overpass elements with center centroids", () => {
    const mapped = mapOverpassElement({
      type: "way",
      id: 99,
      center: { lat: 35.66, lon: 139.7 },
      tags: {
        name: "Park",
        leisure: "park",
        "addr:city": "Tokyo",
      },
    });
    expect(mapped).toEqual(
      expect.objectContaining({
        id: "way/99",
        name: "Park",
        lat: 35.66,
        lng: 139.7,
        categories: ["park"],
      }),
    );
  });

  it("maps travel modes to OSRM profiles", () => {
    expect(osmTravelProfile("walking")).toBe("foot");
    expect(osmTravelProfile("cycling")).toBe("bike");
    expect(osmTravelProfile("transit")).toBe("driving");
    expect(osmTravelProfile("driving")).toBe("driving");
  });
});

describe("Google mappers", () => {
  it("maps Places API New payloads", () => {
    const mapped = mapGooglePlace({
      id: "ChIJtest",
      displayName: { text: "Googleplex" },
      formattedAddress: "1600 Amphitheatre Parkway",
      location: { latitude: 37.42, longitude: -122.08 },
      types: ["point_of_interest"],
      rating: 4.5,
      userRatingCount: 100,
    });
    expect(mapped).toEqual(
      expect.objectContaining({
        id: "ChIJtest",
        name: "Googleplex",
        lat: 37.42,
        lng: -122.08,
        rating: 4.5,
      }),
    );
  });

  it("parses protobuf durations and matrix conditions", () => {
    expect(parseDurationSeconds("12.5s")).toBe(12.5);
    expect(mapGoogleMatrixElement({
      originIndex: 0,
      destinationIndex: 1,
      condition: "ROUTE_EXISTS",
      distanceMeters: 500,
      duration: "60s",
    })).toEqual({
      originIndex: 0,
      destinationIndex: 1,
      condition: "ok",
      distanceMeters: 500,
      durationSeconds: 60,
    });
  });
});

describe("geo provider selection", () => {
  it("defaults to OSM and constructs OsmGeoProvider", () => {
    const config = loadConfig(BASE_ENV);
    expect(config.geo.provider).toBe("osm");
    const provider = createGeoProvider(config.geo);
    expect(provider).toBeInstanceOf(OsmGeoProvider);
  });

  it("requires Google API key when GEO_PROVIDER=google", () => {
    expect(() =>
      loadConfig({ ...BASE_ENV, GEO_PROVIDER: "google" }),
    ).toThrow(/GOOGLE_MAPS_API_KEY/);
  });

  it("constructs GoogleGeoProvider when configured", () => {
    const config = loadConfig({
      ...BASE_ENV,
      GEO_PROVIDER: "google",
      GOOGLE_MAPS_API_KEY: "test-key",
    });
    const provider = createGeoProvider(config.geo);
    expect(provider).toBeInstanceOf(GoogleGeoProvider);
  });

  it("OSM reviewLookup reports unsupported", async () => {
    const provider = new OsmGeoProvider({
      nominatimBaseUrl: "https://nominatim.example.test",
      overpassBaseUrl: "https://overpass.example.test",
      osrmBaseUrl: "https://osrm.example.test",
      userAgent: "OpenTrip-test",
    });
    await expect(provider.reviewLookup({ placeId: "node/1" })).resolves.toEqual({
      placeId: "node/1",
      reviews: [],
      supported: false,
    });
  });
});

describe("geo agent tool wiring", () => {
  it("registers the six read-only geo tools", () => {
    const tools = buildGeoReadTools(new GeoService(mockProvider()));
    expect(Object.keys(tools).sort()).toEqual([
      "placeDetail",
      "placeNearby",
      "placeSearch",
      "reviewLookup",
      "routeCompute",
      "routeMatrix",
    ]);
  });
});
