import { config } from "@/shared/config";
import { apiFetch } from "./client";

export interface StreetViewImage {
  id: string;
  coordinate: { lat: number; lng: number };
  distanceMeters?: number;
  capturedAt?: string;
  headingDegrees?: number;
  supports360: boolean;
  previewUrl: string;
  attribution: { label: string; url?: string };
}

export interface StreetViewViewerConfig {
  provider: string;
  accessToken: string;
}

export interface StreetViewSearchResult {
  outcome: "found" | "empty";
  completeness: "complete" | "partial";
  panoramaAvailable: boolean;
  panoramaCount: number;
  candidateCount: number;
  images: StreetViewImage[];
}

export function searchStreetViews(
  tripId: string,
  input: { lat: number; lng: number; radiusMeters?: number; limit?: number },
  signal?: AbortSignal,
): Promise<StreetViewSearchResult> {
  const query = new URLSearchParams({ lat: String(input.lat), lng: String(input.lng) });
  if (input.radiusMeters !== undefined) query.set("radiusMeters", String(input.radiusMeters));
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  return apiFetch(`/api/trips/${encodeURIComponent(tripId)}/street-view/images?${query}`, { signal });
}

export function fetchStreetViewImage(tripId: string, imageId: string): Promise<StreetViewImage> {
  return apiFetch(
    `/api/trips/${encodeURIComponent(tripId)}/street-view/images/${encodeURIComponent(imageId)}`,
  );
}

export function fetchStreetViewViewerConfig(tripId: string): Promise<StreetViewViewerConfig> {
  return apiFetch(`/api/trips/${encodeURIComponent(tripId)}/street-view/viewer-config`);
}

export function streetViewPreviewSrc(previewUrl: string): string {
  return `${config.baseUrl}${previewUrl}`;
}
