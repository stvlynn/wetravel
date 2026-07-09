import type {
  GeoPlace,
  GeoPlaceDetailQuery,
  GeoPlaceNearbyQuery,
  GeoPlaceSearchQuery,
  GeoReviewLookupQuery,
  GeoReviewLookupResult,
  GeoRoute,
  GeoRouteComputeQuery,
  GeoRouteMatrix,
  GeoRouteMatrixQuery,
} from "./types";

export type {
  GeoTravelMode,
  GeoCoordinate,
  GeoBoundingBox,
  GeoAddress,
  GeoPlace,
  GeoPlaceSearchQuery,
  GeoPlaceNearbyQuery,
  GeoPlaceDetailQuery,
  GeoRouteWaypoint,
  GeoRouteComputeQuery,
  GeoRouteLeg,
  GeoRoute,
  GeoRouteMatrixQuery,
  GeoRouteMatrixCondition,
  GeoRouteMatrixCell,
  GeoRouteMatrix,
  GeoReviewLookupQuery,
  GeoReview,
  GeoReviewLookupResult,
} from "./types";

/**
 * Driven port for provider-neutral geospatial reads.
 * Adapters map Nominatim/Overpass/OSRM or Google Places/Routes into these shapes.
 */
export interface GeoProvider {
  placeSearch(query: GeoPlaceSearchQuery): Promise<GeoPlace[]>;
  placeNearby(query: GeoPlaceNearbyQuery): Promise<GeoPlace[]>;
  placeDetail(query: GeoPlaceDetailQuery): Promise<GeoPlace | null>;
  routeCompute(query: GeoRouteComputeQuery): Promise<GeoRoute | null>;
  routeMatrix(query: GeoRouteMatrixQuery): Promise<GeoRouteMatrix>;
  reviewLookup(query: GeoReviewLookupQuery): Promise<GeoReviewLookupResult>;
}
