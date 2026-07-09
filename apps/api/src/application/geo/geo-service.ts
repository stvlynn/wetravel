import { DomainError } from "../../domain/shared/errors";
import type {
  GeoCoordinate,
  GeoProvider,
  GeoTravelMode,
} from "../../domain/geo";
import {
  toPlaceDto,
  toReviewLookupDto,
  toRouteDto,
  toRouteMatrixDto,
  type GeoPlaceDto,
  type GeoReviewLookupDto,
  type GeoRouteDto,
  type GeoRouteMatrixDto,
} from "./geo-data";

const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 20;
const DEFAULT_NEARBY_LIMIT = 12;
const MAX_NEARBY_LIMIT = 30;
const DEFAULT_NEARBY_RADIUS_M = 1_000;
const MAX_NEARBY_RADIUS_M = 50_000;
const DEFAULT_REVIEW_LIMIT = 5;
const MAX_REVIEW_LIMIT = 20;
const MAX_ROUTE_WAYPOINTS = 25;
const MAX_MATRIX_POINTS = 10;

const TRAVEL_MODES: readonly GeoTravelMode[] = [
  "driving",
  "walking",
  "cycling",
  "transit",
];

export class GeoService {
  constructor(private provider: GeoProvider) {}

  async placeSearch(input: {
    query: string;
    limit?: number;
    lang?: string;
    near?: GeoCoordinate;
  }): Promise<GeoPlaceDto[]> {
    const query = input.query?.trim() ?? "";
    if (query.length < 2) {
      throw new DomainError(
        "invalid_geo_query",
        "query must be at least 2 characters",
      );
    }
    if (input.near) assertCoordinate(input.near.lat, input.near.lng);

    const places = await this.provider.placeSearch({
      query,
      limit: clampLimit(input.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT),
      lang: normalizeLang(input.lang),
      near: input.near,
    });
    return places.map(toPlaceDto);
  }

  async placeNearby(input: {
    lat: number;
    lng: number;
    radiusMeters?: number;
    categories?: string[];
    limit?: number;
    lang?: string;
  }): Promise<GeoPlaceDto[]> {
    assertCoordinate(input.lat, input.lng);
    const radiusMeters = clampRadius(input.radiusMeters);
    const categories = (input.categories ?? [])
      .map((c) => c.trim())
      .filter(Boolean);

    const places = await this.provider.placeNearby({
      lat: input.lat,
      lng: input.lng,
      radiusMeters,
      categories: categories.length > 0 ? categories : undefined,
      limit: clampLimit(input.limit, DEFAULT_NEARBY_LIMIT, MAX_NEARBY_LIMIT),
      lang: normalizeLang(input.lang),
    });
    return places.map(toPlaceDto);
  }

  async placeDetail(input: {
    placeId: string;
    lang?: string;
  }): Promise<GeoPlaceDto | null> {
    const placeId = input.placeId?.trim() ?? "";
    if (!placeId) {
      throw new DomainError("invalid_place_id", "placeId is required");
    }

    const place = await this.provider.placeDetail({
      placeId,
      lang: normalizeLang(input.lang),
    });
    return place ? toPlaceDto(place) : null;
  }

  async routeCompute(input: {
    waypoints: GeoCoordinate[];
    mode?: string;
    includeGeometry?: boolean;
  }): Promise<GeoRouteDto | null> {
    const waypoints = input.waypoints ?? [];
    if (waypoints.length < 2) {
      throw new DomainError(
        "invalid_route_waypoints",
        "at least two waypoints are required",
      );
    }
    if (waypoints.length > MAX_ROUTE_WAYPOINTS) {
      throw new DomainError(
        "invalid_route_waypoints",
        `at most ${MAX_ROUTE_WAYPOINTS} waypoints are allowed`,
      );
    }
    for (const point of waypoints) {
      assertCoordinate(point.lat, point.lng);
    }

    const route = await this.provider.routeCompute({
      waypoints,
      mode: parseTravelMode(input.mode),
      includeGeometry: input.includeGeometry ?? true,
    });
    return route ? toRouteDto(route) : null;
  }

  async routeMatrix(input: {
    origins: GeoCoordinate[];
    destinations: GeoCoordinate[];
    mode?: string;
  }): Promise<GeoRouteMatrixDto> {
    const origins = input.origins ?? [];
    const destinations = input.destinations ?? [];
    if (origins.length === 0 || destinations.length === 0) {
      throw new DomainError(
        "invalid_route_matrix",
        "origins and destinations must be non-empty",
      );
    }
    if (
      origins.length > MAX_MATRIX_POINTS ||
      destinations.length > MAX_MATRIX_POINTS
    ) {
      throw new DomainError(
        "invalid_route_matrix",
        `at most ${MAX_MATRIX_POINTS} origins and destinations are allowed`,
      );
    }
    for (const point of [...origins, ...destinations]) {
      assertCoordinate(point.lat, point.lng);
    }

    const matrix = await this.provider.routeMatrix({
      origins,
      destinations,
      mode: parseTravelMode(input.mode),
    });
    return toRouteMatrixDto(matrix);
  }

  async reviewLookup(input: {
    placeId: string;
    limit?: number;
    lang?: string;
  }): Promise<GeoReviewLookupDto> {
    const placeId = input.placeId?.trim() ?? "";
    if (!placeId) {
      throw new DomainError("invalid_place_id", "placeId is required");
    }

    const result = await this.provider.reviewLookup({
      placeId,
      limit: clampLimit(input.limit, DEFAULT_REVIEW_LIMIT, MAX_REVIEW_LIMIT),
      lang: normalizeLang(input.lang),
    });
    return toReviewLookupDto(result);
  }
}

function assertCoordinate(lat: number, lng: number): void {
  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new DomainError("invalid_coordinates", "lat and lng are invalid");
  }
}

function clampLimit(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined || Number.isNaN(value)) return fallback;
  return Math.min(Math.max(1, Math.floor(value)), max);
}

function clampRadius(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value) || value <= 0) {
    return DEFAULT_NEARBY_RADIUS_M;
  }
  return Math.min(Math.floor(value), MAX_NEARBY_RADIUS_M);
}

function parseTravelMode(value: string | undefined): GeoTravelMode {
  if (!value) return "driving";
  const normalized = value.trim().toLowerCase();
  if ((TRAVEL_MODES as readonly string[]).includes(normalized)) {
    return normalized as GeoTravelMode;
  }
  throw new DomainError(
    "invalid_travel_mode",
    `mode must be one of ${TRAVEL_MODES.join(", ")}`,
  );
}

function normalizeLang(lang: string | undefined): string | undefined {
  if (!lang?.trim()) return undefined;
  const lower = lang.trim().toLowerCase();
  if (lower.startsWith("zh")) return "zh";
  return lower.split("-")[0] ?? "en";
}
