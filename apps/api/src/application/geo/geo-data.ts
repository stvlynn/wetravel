import type {
  GeoAddress,
  GeoBoundingBox,
  GeoPlace,
  GeoReview,
  GeoReviewLookupResult,
  GeoRoute,
  GeoRouteMatrix,
  GeoTravelMode,
} from "../../domain/geo";

/** Stable application DTOs exposed to HTTP and agent tools. */

export type GeoTravelModeDto = GeoTravelMode;

export interface GeoCoordinateDto {
  lat: number;
  lng: number;
}

export interface GeoAddressDto extends GeoAddress {}

export interface GeoBoundingBoxDto extends GeoBoundingBox {}

export interface GeoPlaceDto {
  id: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
  categories: string[];
  address?: GeoAddressDto;
  boundingBox?: GeoBoundingBoxDto;
  rating?: number;
  ratingCount?: number;
  phone?: string;
  website?: string;
  openingHours?: string[];
  extras?: Record<string, string>;
}

export interface GeoRouteLegDto {
  distanceMeters: number;
  durationSeconds: number;
}

export interface GeoRouteDto {
  distanceMeters: number;
  durationSeconds: number;
  legs: GeoRouteLegDto[];
  geometry?: string;
  mode: GeoTravelModeDto;
}

export interface GeoRouteMatrixCellDto {
  originIndex: number;
  destinationIndex: number;
  condition: "ok" | "no_route" | "unknown";
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface GeoRouteMatrixDto {
  cells: GeoRouteMatrixCellDto[];
  mode: GeoTravelModeDto;
}

export interface GeoReviewDto {
  authorName: string;
  rating?: number;
  text: string;
  publishedAt?: string;
  languageCode?: string;
}

export interface GeoReviewLookupDto {
  placeId: string;
  reviews: GeoReviewDto[];
  supported: boolean;
}

export function toPlaceDto(place: GeoPlace): GeoPlaceDto {
  return {
    id: place.id,
    name: place.name,
    label: place.label,
    lat: place.lat,
    lng: place.lng,
    categories: [...place.categories],
    address: place.address ? { ...place.address } : undefined,
    boundingBox: place.boundingBox ? { ...place.boundingBox } : undefined,
    rating: place.rating,
    ratingCount: place.ratingCount,
    phone: place.phone,
    website: place.website,
    openingHours: place.openingHours ? [...place.openingHours] : undefined,
    extras: place.extras ? { ...place.extras } : undefined,
  };
}

export function toRouteDto(route: GeoRoute): GeoRouteDto {
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    legs: route.legs.map((leg) => ({ ...leg })),
    geometry: route.geometry,
    mode: route.mode,
  };
}

export function toRouteMatrixDto(matrix: GeoRouteMatrix): GeoRouteMatrixDto {
  return {
    mode: matrix.mode,
    cells: matrix.cells.map((cell) => ({ ...cell })),
  };
}

export function toReviewLookupDto(
  result: GeoReviewLookupResult,
): GeoReviewLookupDto {
  return {
    placeId: result.placeId,
    supported: result.supported,
    reviews: result.reviews.map(toReviewDto),
  };
}

function toReviewDto(review: GeoReview): GeoReviewDto {
  return {
    authorName: review.authorName,
    rating: review.rating,
    text: review.text,
    publishedAt: review.publishedAt,
    languageCode: review.languageCode,
  };
}
