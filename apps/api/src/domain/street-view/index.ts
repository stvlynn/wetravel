export interface StreetViewCoordinate {
  lat: number;
  lng: number;
}

export interface StreetViewAttribution {
  label: string;
  url?: string;
}

export interface StreetViewImage {
  id: string;
  coordinate: StreetViewCoordinate;
  capturedAt?: string;
  headingDegrees?: number;
  supports360: boolean;
  previewSource: string;
  attribution: StreetViewAttribution;
}

export interface StreetViewSearchQuery extends StreetViewCoordinate {
  radiusMeters: number;
  limit: number;
}

export interface StreetViewProviderSearchResult {
  images: StreetViewImage[];
  completeness: "complete" | "partial";
}

export interface StreetViewPreview {
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export interface StreetViewViewerConfig {
  provider: string;
  accessToken: string;
}

/** Provider port. Provider-specific identifiers and URLs stay behind it. */
export interface StreetViewProvider {
  searchNearby(query: StreetViewSearchQuery): Promise<StreetViewProviderSearchResult>;
  getImage(imageId: string): Promise<StreetViewImage | null>;
  readPreview(imageId: string): Promise<StreetViewPreview>;
  getViewerConfig(): StreetViewViewerConfig;
}
