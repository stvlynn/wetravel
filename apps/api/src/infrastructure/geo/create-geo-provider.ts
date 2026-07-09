import type { GeoProvider } from "../../domain/geo";
import type { GeoConfig } from "../config";
import { GoogleGeoProvider } from "./google/google-geo-provider";
import { OsmGeoProvider } from "./osm/osm-geo-provider";

/** Construct the configured GeoProvider implementation. */
export function createGeoProvider(config: GeoConfig): GeoProvider {
  if (config.provider === "google") {
    return new GoogleGeoProvider({
      apiKey: config.googleMapsApiKey ?? "",
      timeoutMs: config.timeoutMs,
      cacheTtlMs: config.cacheTtlMs,
    });
  }

  return new OsmGeoProvider({
    nominatimBaseUrl: config.osm.nominatimBaseUrl,
    overpassBaseUrl: config.osm.overpassBaseUrl,
    osrmBaseUrl: config.osm.osrmBaseUrl,
    userAgent: config.osm.userAgent,
    timeoutMs: config.timeoutMs,
    cacheTtlMs: config.cacheTtlMs,
  });
}
