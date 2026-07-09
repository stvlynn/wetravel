import type {
  GeoPlace,
  GeoReview,
  GeoRoute,
  GeoRouteLeg,
  GeoRouteMatrixCell,
  GeoTravelMode,
} from "../../../domain/geo";
import type { GooglePlace, GoogleReview } from "./places-types";
import type {
  GoogleRoute,
  GoogleRouteLeg as GoogleLeg,
  GoogleRouteMatrixElement,
} from "./routes-types";

export function mapGooglePlace(place: GooglePlace): GeoPlace | null {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (lat === undefined || lng === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const id = place.id?.trim();
  if (!id) return null;

  const name =
    place.displayName?.text?.trim() ||
    place.formattedAddress?.trim() ||
    id;
  const label = place.formattedAddress?.trim() || name;

  return {
    id,
    name,
    label,
    lat,
    lng,
    categories: place.types ?? [],
    rating: place.rating,
    ratingCount: place.userRatingCount,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber,
    website: place.websiteUri,
    openingHours: place.regularOpeningHours?.weekdayDescriptions,
  };
}

export function mapGooglePlaces(places: GooglePlace[] | undefined): GeoPlace[] {
  return (places ?? [])
    .map(mapGooglePlace)
    .filter((place): place is GeoPlace => place !== null);
}

export function mapGoogleReviews(reviews: GoogleReview[] | undefined): GeoReview[] {
  return (reviews ?? [])
    .map(mapGoogleReview)
    .filter((review): review is GeoReview => review !== null);
}

function mapGoogleReview(review: GoogleReview): GeoReview | null {
  const text =
    review.text?.text?.trim() ||
    review.originalText?.text?.trim() ||
    "";
  if (!text) return null;
  return {
    authorName: review.authorAttribution?.displayName?.trim() || "Anonymous",
    rating: review.rating,
    text,
    publishedAt: review.publishTime,
    languageCode:
      review.text?.languageCode ?? review.originalText?.languageCode,
  };
}

export function mapGoogleRoute(
  route: GoogleRoute,
  mode: GeoTravelMode,
  includeGeometry: boolean,
): GeoRoute {
  return {
    distanceMeters: route.distanceMeters ?? 0,
    durationSeconds: parseDurationSeconds(route.duration),
    legs: (route.legs ?? []).map(mapGoogleLeg),
    geometry:
      includeGeometry && route.polyline?.encodedPolyline
        ? route.polyline.encodedPolyline
        : undefined,
    mode,
  };
}

function mapGoogleLeg(leg: GoogleLeg): GeoRouteLeg {
  return {
    distanceMeters: leg.distanceMeters ?? 0,
    durationSeconds: parseDurationSeconds(leg.duration),
  };
}

export function mapGoogleMatrixElement(
  element: GoogleRouteMatrixElement,
): GeoRouteMatrixCell {
  const originIndex = element.originIndex ?? 0;
  const destinationIndex = element.destinationIndex ?? 0;
  if (element.condition === "ROUTE_EXISTS") {
    return {
      originIndex,
      destinationIndex,
      condition: "ok",
      distanceMeters: element.distanceMeters,
      durationSeconds: parseDurationSeconds(element.duration),
    };
  }
  if (element.condition === "ROUTE_NOT_FOUND") {
    return {
      originIndex,
      destinationIndex,
      condition: "no_route",
    };
  }
  return {
    originIndex,
    destinationIndex,
    condition: "unknown",
  };
}

export function googleTravelMode(mode: GeoTravelMode): string {
  switch (mode) {
    case "walking":
      return "WALK";
    case "cycling":
      return "BICYCLE";
    case "transit":
      return "TRANSIT";
    case "driving":
    default:
      return "DRIVE";
  }
}

/** Parse protobuf Duration strings like `123s` or `3.5s` into seconds. */
export function parseDurationSeconds(value: string | undefined): number {
  if (!value) return 0;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)s$/i);
  if (!match) return 0;
  return Number(match[1]);
}
