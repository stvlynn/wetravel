/** Vendor-neutral travel mode for routing. */
export type GeoTravelMode = "driving" | "walking" | "cycling" | "transit";

/** WGS84 coordinate used at the domain boundary (`lat`/`lng`). */
export interface GeoCoordinate {
  lat: number;
  lng: number;
}

export interface GeoBoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

/** Structured address components when a provider returns them. */
export interface GeoAddress {
  houseNumber?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countryCode?: string;
}

/** One place result shared by search, nearby, and detail. */
export interface GeoPlace {
  /** Provider-stable id (OSM `type/id` or Google place id). */
  id: string;
  name: string;
  /** Full display label / formatted address. */
  label: string;
  lat: number;
  lng: number;
  categories: string[];
  address?: GeoAddress;
  boundingBox?: GeoBoundingBox;
  rating?: number;
  ratingCount?: number;
  phone?: string;
  website?: string;
  openingHours?: string[];
  /** Extra provider tags kept for agent context (OSM extratags, etc.). */
  extras?: Record<string, string>;
}

export interface GeoPlaceSearchQuery {
  query: string;
  limit?: number;
  lang?: string;
  /** Optional bias near a coordinate. */
  near?: GeoCoordinate;
}

export interface GeoPlaceNearbyQuery {
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Category / type filters (provider maps them to tags or includedTypes). */
  categories?: string[];
  limit?: number;
  lang?: string;
}

export interface GeoPlaceDetailQuery {
  placeId: string;
  lang?: string;
}

export interface GeoRouteWaypoint extends GeoCoordinate {}

export interface GeoRouteComputeQuery {
  waypoints: GeoRouteWaypoint[];
  mode?: GeoTravelMode;
  /** Include encoded polyline / path when the provider supports it. */
  includeGeometry?: boolean;
}

export interface GeoRouteLeg {
  distanceMeters: number;
  durationSeconds: number;
}

export interface GeoRoute {
  distanceMeters: number;
  durationSeconds: number;
  legs: GeoRouteLeg[];
  /** Encoded polyline or provider path string when requested. */
  geometry?: string;
  mode: GeoTravelMode;
}

export interface GeoRouteMatrixQuery {
  origins: GeoCoordinate[];
  destinations: GeoCoordinate[];
  mode?: GeoTravelMode;
}

export type GeoRouteMatrixCondition = "ok" | "no_route" | "unknown";

export interface GeoRouteMatrixCell {
  originIndex: number;
  destinationIndex: number;
  condition: GeoRouteMatrixCondition;
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface GeoRouteMatrix {
  cells: GeoRouteMatrixCell[];
  mode: GeoTravelMode;
}

export interface GeoReviewLookupQuery {
  placeId: string;
  limit?: number;
  lang?: string;
}

export interface GeoReview {
  authorName: string;
  rating?: number;
  text: string;
  /** ISO-8601 when available. */
  publishedAt?: string;
  languageCode?: string;
}

export interface GeoReviewLookupResult {
  placeId: string;
  reviews: GeoReview[];
  /** False when the active provider cannot supply reviews (e.g. OSM). */
  supported: boolean;
}
