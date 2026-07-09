/** Google Routes API v2 response shapes. */

export interface GoogleRoutesLatLng {
  latitude?: number;
  longitude?: number;
}

export interface GoogleRouteLeg {
  distanceMeters?: number;
  duration?: string;
}

export interface GoogleRoute {
  distanceMeters?: number;
  duration?: string;
  legs?: GoogleRouteLeg[];
  polyline?: {
    encodedPolyline?: string;
  };
}

export interface GoogleComputeRoutesResponse {
  routes?: GoogleRoute[];
}

export interface GoogleRouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  status?: { code?: number; message?: string };
  condition?:
    | "ROUTE_EXISTS"
    | "ROUTE_NOT_FOUND"
    | string;
  distanceMeters?: number;
  duration?: string;
}

/** computeRouteMatrix returns a JSON array of elements (not wrapped). */
export type GoogleComputeRouteMatrixResponse = GoogleRouteMatrixElement[];
