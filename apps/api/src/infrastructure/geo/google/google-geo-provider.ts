import { GeoError } from "../../../application/geo/geo-error";
import type {
  GeoPlace,
  GeoProvider,
  GeoPlaceDetailQuery,
  GeoPlaceNearbyQuery,
  GeoPlaceSearchQuery,
  GeoReviewLookupQuery,
  GeoReviewLookupResult,
  GeoRoute,
  GeoRouteComputeQuery,
  GeoRouteMatrix,
  GeoRouteMatrixQuery,
  GeoTravelMode,
} from "../../../domain/geo";
import { GeoCache, roundCoordinate } from "../geo-cache";
import { fetchJson } from "../http";
import {
  googleTravelMode,
  mapGoogleMatrixElement,
  mapGooglePlace,
  mapGooglePlaces,
  mapGoogleReviews,
  mapGoogleRoute,
} from "./mappers";
import type {
  GooglePlace,
  GooglePlacesSearchResponse,
} from "./places-types";
import type {
  GoogleComputeRouteMatrixResponse,
  GoogleComputeRoutesResponse,
} from "./routes-types";

export interface GoogleGeoConfig {
  apiKey: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;

const PLACES_BASE = "https://places.googleapis.com/v1";
const ROUTES_BASE = "https://routes.googleapis.com";

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.rating",
  "places.userRatingCount",
].join(",");

const DETAIL_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "rating",
  "userRatingCount",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
  "reviews",
].join(",");

const ROUTE_FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.legs.distanceMeters",
  "routes.legs.duration",
  "routes.polyline.encodedPolyline",
].join(",");

const MATRIX_FIELD_MASK = [
  "originIndex",
  "destinationIndex",
  "condition",
  "distanceMeters",
  "duration",
].join(",");

/**
 * Google Maps-backed GeoProvider: Places API New + Routes API v2.
 */
export class GoogleGeoProvider implements GeoProvider {
  private readonly timeoutMs: number;
  private readonly cache: GeoCache;

  constructor(private readonly config: GoogleGeoConfig) {
    if (!config.apiKey?.trim()) {
      throw new GeoError(
        "geo_not_configured",
        "GOOGLE_MAPS_API_KEY is required when GEO_PROVIDER=google",
      );
    }
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cache = new GeoCache(config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
  }

  async placeSearch(query: GeoPlaceSearchQuery): Promise<GeoPlace[]> {
    const limit = query.limit ?? 8;
    const lang = query.lang ?? "en";
    const nearKey = query.near
      ? `${roundCoordinate(query.near.lat)},${roundCoordinate(query.near.lng)}`
      : "";
    const cacheKey = [
      "google:search",
      query.query.toLowerCase(),
      limit,
      lang,
      nearKey,
    ].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      const body: Record<string, unknown> = {
        textQuery: query.query,
        maxResultCount: limit,
        languageCode: lang,
      };
      if (query.near) {
        body.locationBias = {
          circle: {
            center: {
              latitude: query.near.lat,
              longitude: query.near.lng,
            },
            radius: 5_000,
          },
        };
      }

      const raw = await fetchJson<GooglePlacesSearchResponse>({
        url: `${PLACES_BASE}/places:searchText`,
        method: "POST",
        headers: this.placesHeaders(SEARCH_FIELD_MASK),
        body: JSON.stringify(body),
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to search places via Google Places",
      });
      return mapGooglePlaces(raw.places);
    });
  }

  async placeNearby(query: GeoPlaceNearbyQuery): Promise<GeoPlace[]> {
    const limit = query.limit ?? 12;
    const lang = query.lang ?? "en";
    const categories = (query.categories ?? [])
      .map((c) => c.trim())
      .filter(Boolean);
    const cacheKey = [
      "google:nearby",
      roundCoordinate(query.lat),
      roundCoordinate(query.lng),
      query.radiusMeters,
      categories.join(","),
      limit,
      lang,
    ].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      const body: Record<string, unknown> = {
        maxResultCount: limit,
        languageCode: lang,
        locationRestriction: {
          circle: {
            center: {
              latitude: query.lat,
              longitude: query.lng,
            },
            radius: query.radiusMeters,
          },
        },
      };
      if (categories.length > 0) {
        body.includedTypes = categories.map(toGooglePlaceType);
      }

      const raw = await fetchJson<GooglePlacesSearchResponse>({
        url: `${PLACES_BASE}/places:searchNearby`,
        method: "POST",
        headers: this.placesHeaders(SEARCH_FIELD_MASK),
        body: JSON.stringify(body),
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to search nearby places via Google Places",
      });
      return mapGooglePlaces(raw.places);
    });
  }

  async placeDetail(query: GeoPlaceDetailQuery): Promise<GeoPlace | null> {
    const placeId = query.placeId.trim();
    const lang = query.lang ?? "en";
    const cacheKey = ["google:detail", placeId, lang].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      const url = new URL(
        `${PLACES_BASE}/places/${encodeURIComponent(placeId)}`,
      );
      url.searchParams.set("languageCode", lang);

      const raw = await fetchJson<GooglePlace>({
        url,
        headers: this.placesHeaders(DETAIL_FIELD_MASK),
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to fetch place details via Google Places",
      });
      return mapGooglePlace(raw);
    });
  }

  async routeCompute(query: GeoRouteComputeQuery): Promise<GeoRoute | null> {
    const mode: GeoTravelMode = query.mode ?? "driving";
    const includeGeometry = query.includeGeometry ?? true;
    const waypoints = query.waypoints;
    if (waypoints.length < 2) return null;

    const origin = waypoints[0]!;
    const destination = waypoints[waypoints.length - 1]!;
    const intermediates = waypoints.slice(1, -1);
    const cacheKey = [
      "google:route",
      mode,
      waypoints.map((p) => `${p.lat},${p.lng}`).join(";"),
      includeGeometry ? "geo" : "nogeo",
    ].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      const body: Record<string, unknown> = {
        origin: latLngWaypoint(origin.lat, origin.lng),
        destination: latLngWaypoint(destination.lat, destination.lng),
        travelMode: googleTravelMode(mode),
        languageCode: "en",
      };
      if (intermediates.length > 0) {
        body.intermediates = intermediates.map((p) =>
          latLngWaypoint(p.lat, p.lng),
        );
      }

      const raw = await fetchJson<GoogleComputeRoutesResponse>({
        url: `${ROUTES_BASE}/directions/v2:computeRoutes`,
        method: "POST",
        headers: this.routesHeaders(ROUTE_FIELD_MASK),
        body: JSON.stringify(body),
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to compute route via Google Routes",
      });
      const route = raw.routes?.[0];
      if (!route) return null;
      return mapGoogleRoute(route, mode, includeGeometry);
    });
  }

  async routeMatrix(query: GeoRouteMatrixQuery): Promise<GeoRouteMatrix> {
    const mode: GeoTravelMode = query.mode ?? "driving";
    const cacheKey = [
      "google:matrix",
      mode,
      query.origins.map((p) => `${p.lat},${p.lng}`).join(";"),
      query.destinations.map((p) => `${p.lat},${p.lng}`).join(";"),
    ].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      const body = {
        origins: query.origins.map((p) => ({
          waypoint: latLngWaypoint(p.lat, p.lng),
        })),
        destinations: query.destinations.map((p) => ({
          waypoint: latLngWaypoint(p.lat, p.lng),
        })),
        travelMode: googleTravelMode(mode),
      };

      const raw = await fetchJson<GoogleComputeRouteMatrixResponse>({
        url: `${ROUTES_BASE}/distanceMatrix/v2:computeRouteMatrix`,
        method: "POST",
        headers: this.routesHeaders(MATRIX_FIELD_MASK),
        body: JSON.stringify(body),
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to compute route matrix via Google Routes",
      });
      const elements = Array.isArray(raw) ? raw : [];
      return {
        mode,
        cells: elements.map(mapGoogleMatrixElement),
      };
    });
  }

  async reviewLookup(query: GeoReviewLookupQuery): Promise<GeoReviewLookupResult> {
    const placeId = query.placeId.trim();
    const limit = query.limit ?? 5;
    const lang = query.lang ?? "en";
    const cacheKey = ["google:reviews", placeId, limit, lang].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      const url = new URL(
        `${PLACES_BASE}/places/${encodeURIComponent(placeId)}`,
      );
      url.searchParams.set("languageCode", lang);

      const raw = await fetchJson<GooglePlace>({
        url,
        headers: this.placesHeaders("id,reviews"),
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to fetch reviews via Google Places",
      });
      return {
        placeId,
        supported: true,
        reviews: mapGoogleReviews(raw.reviews).slice(0, limit),
      };
    });
  }

  private placesHeaders(fieldMask: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": this.config.apiKey,
      "X-Goog-FieldMask": fieldMask,
    };
  }

  private routesHeaders(fieldMask: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": this.config.apiKey,
      "X-Goog-FieldMask": fieldMask,
    };
  }
}

function latLngWaypoint(lat: number, lng: number) {
  return {
    location: {
      latLng: {
        latitude: lat,
        longitude: lng,
      },
    },
  };
}

/** Normalize free-form category tokens toward Places includedTypes. */
function toGooglePlaceType(category: string): string {
  const value = category.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value.includes("=")) {
    return value.split("=").pop()!.replace(/[^a-z0-9_]/g, "") || "tourist_attraction";
  }
  return value.replace(/[^a-z0-9_]/g, "") || "tourist_attraction";
}

export {
  mapGooglePlace,
  mapGooglePlaces,
  mapGoogleReviews,
  mapGoogleRoute,
  mapGoogleMatrixElement,
  googleTravelMode,
  parseDurationSeconds,
} from "./mappers";
