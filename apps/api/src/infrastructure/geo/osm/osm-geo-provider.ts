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
  GeoRouteMatrixCell,
  GeoRouteMatrixQuery,
  GeoTravelMode,
} from "../../../domain/geo";
import { GeoCache, roundCoordinate } from "../geo-cache";
import { fetchJson } from "../http";
import { RateLimiter } from "../rate-limiter";
import {
  mapNominatimResult,
  mapNominatimResults,
  mapOverpassElements,
  osmTravelProfile,
} from "./mappers";
import type { NominatimResult } from "./nominatim-types";
import type { OverpassResponse } from "./overpass-types";
import type { OsrmRouteResponse, OsrmTableResponse } from "./osrm-types";

export interface OsmGeoConfig {
  nominatimBaseUrl: string;
  overpassBaseUrl: string;
  osrmBaseUrl: string;
  userAgent: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
/** Nominatim public usage policy: max ~1 req/s. */
const NOMINATIM_MIN_INTERVAL_MS = 1_100;
/** Soft Overpass pacing for shared public instances. */
const OVERPASS_MIN_INTERVAL_MS = 1_500;

const DEFAULT_NEARBY_TAGS = [
  "amenity",
  "tourism",
  "shop",
  "leisure",
  "historic",
];

/**
 * OSM-backed GeoProvider: Nominatim (search/detail), Overpass (nearby),
 * OSRM (route/matrix). Reviews are unsupported.
 */
export class OsmGeoProvider implements GeoProvider {
  private readonly timeoutMs: number;
  private readonly cache: GeoCache;
  private readonly nominatimLimiter = new RateLimiter(1, NOMINATIM_MIN_INTERVAL_MS);
  private readonly overpassLimiter = new RateLimiter(1, OVERPASS_MIN_INTERVAL_MS);

  constructor(private readonly config: OsmGeoConfig) {
    if (!config.userAgent?.trim()) {
      throw new GeoError(
        "geo_not_configured",
        "GEO_OSM_USER_AGENT is required when GEO_PROVIDER=osm",
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
      "osm:search",
      query.query.toLowerCase(),
      limit,
      lang,
      nearKey,
    ].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      await this.nominatimLimiter.acquire();
      const url = new URL("search", ensureTrailingSlash(this.config.nominatimBaseUrl));
      url.searchParams.set("q", query.query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("extratags", "1");
      url.searchParams.set("namedetails", "1");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("accept-language", lang);
      if (query.near) {
        // Viewbox bias (~0.2° around the point) with bounded results preferred.
        const d = 0.2;
        url.searchParams.set(
          "viewbox",
          [
            query.near.lng - d,
            query.near.lat + d,
            query.near.lng + d,
            query.near.lat - d,
          ].join(","),
        );
        url.searchParams.set("bounded", "0");
      }

      const raw = await fetchJson<NominatimResult[]>({
        url,
        headers: this.nominatimHeaders(),
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to search places via Nominatim",
      });
      return mapNominatimResults(Array.isArray(raw) ? raw : []);
    });
  }

  async placeNearby(query: GeoPlaceNearbyQuery): Promise<GeoPlace[]> {
    const limit = query.limit ?? 12;
    const categories = (query.categories ?? []).map((c) => c.trim()).filter(Boolean);
    const cacheKey = [
      "osm:nearby",
      roundCoordinate(query.lat),
      roundCoordinate(query.lng),
      query.radiusMeters,
      categories.join(","),
      limit,
    ].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      await this.overpassLimiter.acquire();
      const ql = buildNearbyOverpassQuery(query, categories, limit);
      const url = new URL(this.config.overpassBaseUrl);
      const raw = await fetchJson<OverpassResponse>({
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": this.config.userAgent,
          Accept: "application/json",
        },
        body: `data=${encodeURIComponent(ql)}`,
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to query nearby places via Overpass",
      });
      return mapOverpassElements(raw.elements ?? []).slice(0, limit);
    });
  }

  async placeDetail(query: GeoPlaceDetailQuery): Promise<GeoPlace | null> {
    const placeId = query.placeId.trim();
    const lang = query.lang ?? "en";
    const cacheKey = ["osm:detail", placeId, lang].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      const osmRef = parseOsmPlaceId(placeId);
      if (!osmRef) return null;

      await this.nominatimLimiter.acquire();
      const url = new URL("lookup", ensureTrailingSlash(this.config.nominatimBaseUrl));
      url.searchParams.set("osm_ids", `${osmRef.prefix}${osmRef.id}`);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("extratags", "1");
      url.searchParams.set("namedetails", "1");
      url.searchParams.set("accept-language", lang);

      const raw = await fetchJson<NominatimResult[]>({
        url,
        headers: this.nominatimHeaders(),
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to look up place via Nominatim",
      });
      const first = Array.isArray(raw) ? raw[0] : undefined;
      return first ? mapNominatimResult(first) : null;
    });
  }

  async routeCompute(query: GeoRouteComputeQuery): Promise<GeoRoute | null> {
    const mode: GeoTravelMode = query.mode ?? "driving";
    const profile = osmTravelProfile(mode);
    const coords = query.waypoints
      .map((p) => `${p.lng},${p.lat}`)
      .join(";");
    const includeGeometry = query.includeGeometry ?? true;
    const cacheKey = [
      "osm:route",
      profile,
      coords,
      includeGeometry ? "geo" : "nogeo",
    ].join(":");

    return this.cache.getOrLoad(cacheKey, async () => {
      const url = new URL(
        `route/v1/${profile}/${coords}`,
        ensureTrailingSlash(this.config.osrmBaseUrl),
      );
      url.searchParams.set("overview", includeGeometry ? "simplified" : "false");
      url.searchParams.set("geometries", "polyline");
      url.searchParams.set("steps", "false");

      const raw = await fetchJson<OsrmRouteResponse>({
        url,
        headers: { "User-Agent": this.config.userAgent, Accept: "application/json" },
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to compute route via OSRM",
      });
      if (raw.code !== "Ok" || !raw.routes?.[0]) return null;
      const route = raw.routes[0];
      return {
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        legs: (route.legs ?? []).map((leg) => ({
          distanceMeters: leg.distance,
          durationSeconds: leg.duration,
        })),
        geometry:
          includeGeometry && typeof route.geometry === "string"
            ? route.geometry
            : undefined,
        mode,
      };
    });
  }

  async routeMatrix(query: GeoRouteMatrixQuery): Promise<GeoRouteMatrix> {
    const mode: GeoTravelMode = query.mode ?? "driving";
    const profile = osmTravelProfile(mode);
    const points = [...query.origins, ...query.destinations];
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const sources = query.origins.map((_, i) => i).join(";");
    const destinations = query.destinations
      .map((_, i) => query.origins.length + i)
      .join(";");
    const cacheKey = ["osm:matrix", profile, coords, sources, destinations].join(
      ":",
    );

    return this.cache.getOrLoad(cacheKey, async () => {
      const url = new URL(
        `table/v1/${profile}/${coords}`,
        ensureTrailingSlash(this.config.osrmBaseUrl),
      );
      url.searchParams.set("sources", sources);
      url.searchParams.set("destinations", destinations);
      url.searchParams.set("annotations", "duration,distance");

      const raw = await fetchJson<OsrmTableResponse>({
        url,
        headers: { "User-Agent": this.config.userAgent, Accept: "application/json" },
        timeoutMs: this.timeoutMs,
        errorMessage: "Failed to compute route matrix via OSRM",
      });
      if (raw.code !== "Ok") {
        throw new GeoError("geo_failed", "OSRM route matrix failed");
      }

      const cells: GeoRouteMatrixCell[] = [];
      const durations = raw.durations ?? [];
      const distances = raw.distances ?? [];
      for (let oi = 0; oi < query.origins.length; oi++) {
        for (let di = 0; di < query.destinations.length; di++) {
          const duration = durations[oi]?.[di] ?? null;
          const distance = distances[oi]?.[di] ?? null;
          if (duration == null || distance == null) {
            cells.push({
              originIndex: oi,
              destinationIndex: di,
              condition: "no_route",
            });
            continue;
          }
          cells.push({
            originIndex: oi,
            destinationIndex: di,
            condition: "ok",
            durationSeconds: duration,
            distanceMeters: distance,
          });
        }
      }
      return { cells, mode };
    });
  }

  async reviewLookup(query: GeoReviewLookupQuery): Promise<GeoReviewLookupResult> {
    return {
      placeId: query.placeId,
      reviews: [],
      supported: false,
    };
  }

  private nominatimHeaders(): Record<string, string> {
    return {
      "User-Agent": this.config.userAgent,
      Accept: "application/json",
    };
  }
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

function parseOsmPlaceId(
  placeId: string,
): { prefix: "N" | "W" | "R"; id: string } | null {
  const match = placeId.trim().match(/^(node|way|relation)[/:](\d+)$/i);
  if (!match) return null;
  const type = match[1]!.toLowerCase();
  const id = match[2]!;
  const prefix = type === "node" ? "N" : type === "way" ? "W" : "R";
  return { prefix, id };
}

function buildNearbyOverpassQuery(
  query: GeoPlaceNearbyQuery,
  categories: string[],
  limit: number,
): string {
  const radius = Math.max(1, Math.floor(query.radiusMeters));
  const around = `around:${radius},${query.lat},${query.lng}`;
  const filters =
    categories.length > 0
      ? categories.flatMap(categoryToOverpassFilters)
      : DEFAULT_NEARBY_TAGS.map((tag) => `["${tag}"]`);

  const selectors = filters
    .map((filter) => `nwr${filter}(${around});`)
    .join("\n  ");

  return `[out:json][timeout:25];
(
  ${selectors}
);
out center ${limit};`;
}

/** Map a free-form category string to one or more Overpass tag filters (OR). */
function categoryToOverpassFilters(category: string): string[] {
  const value = category.trim().toLowerCase();
  if (!value) return ['["amenity"]'];
  if (value.includes("=")) {
    const [key, ...rest] = value.split("=");
    const safeKey = sanitizeOverpassToken(key ?? "amenity");
    const safeValue = sanitizeOverpassToken(rest.join("="));
    return [`["${safeKey}"="${safeValue}"]`];
  }
  if (value.includes(":")) {
    const [key, ...rest] = value.split(":");
    const safeKey = sanitizeOverpassToken(key ?? "amenity");
    const safeValue = sanitizeOverpassToken(rest.join(":"));
    return [`["${safeKey}"="${safeValue}"]`];
  }
  // Bare tokens match common OSM keys as OR alternatives.
  const safe = sanitizeOverpassToken(value);
  return [
    `["amenity"="${safe}"]`,
    `["tourism"="${safe}"]`,
    `["shop"="${safe}"]`,
    `["leisure"="${safe}"]`,
  ];
}

function sanitizeOverpassToken(value: string): string {
  return value.replace(/[^a-z0-9_:-]/gi, "").slice(0, 64) || "amenity";
}

export {
  mapNominatimResult,
  mapNominatimResults,
  mapOverpassElement,
  mapOverpassElements,
  osmTravelProfile,
} from "./mappers";
