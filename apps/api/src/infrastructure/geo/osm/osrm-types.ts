/** OSRM route / table JSON shapes used by the OSM provider. */

export interface OsrmRouteLeg {
  distance: number;
  duration: number;
}

export interface OsrmRoute {
  distance: number;
  duration: number;
  legs?: OsrmRouteLeg[];
  geometry?: string | { coordinates?: [number, number][] };
}

export interface OsrmRouteResponse {
  code: string;
  routes?: OsrmRoute[];
}

export interface OsrmTableResponse {
  code: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
}
