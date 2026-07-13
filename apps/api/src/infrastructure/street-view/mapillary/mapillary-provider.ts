import type {
  StreetViewImage,
  StreetViewPreview,
  StreetViewProvider,
  StreetViewProviderSearchResult,
  StreetViewSearchQuery,
  StreetViewViewerConfig,
} from "../../../domain/street-view";
import { StreetViewError } from "../../../application/street-view";

const GRAPH_URL = "https://graph.mapillary.com";
const IMAGE_FIELDS = [
  "id",
  "captured_at",
  "computed_compass_angle",
  "computed_geometry",
  "is_pano",
  "thumb_1024_url",
].join(",");
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const CANDIDATE_LIMIT = 20;
const SUPPORTED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp"]);

interface MapillaryImageJson {
  id?: string;
  captured_at?: number;
  computed_compass_angle?: number;
  computed_geometry?: { coordinates?: [number, number] };
  is_pano?: boolean;
  thumb_1024_url?: string;
}

export class MapillaryStreetViewProvider implements StreetViewProvider {
  constructor(
    private readonly accessToken: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async searchNearby(query: StreetViewSearchQuery): Promise<StreetViewProviderSearchResult> {
    const bbox = boundingBox(query.lat, query.lng, query.radiusMeters);
    const [panoramas, general] = await Promise.allSettled([
      this.searchLane(bbox, "pano"),
      this.searchLane(bbox),
    ]);
    const successful = [panoramas, general].filter(
      (result): result is PromiseFulfilledResult<StreetViewImage[]> =>
        result.status === "fulfilled",
    );
    if (successful.length === 0) {
      throw panoramas.status === "rejected"
        ? panoramas.reason
        : new StreetViewError("street_view_upstream_error", "Street-view provider request failed");
    }
    const merged = new Map<string, StreetViewImage>();
    for (const result of successful) {
      for (const image of result.value) merged.set(image.id, image);
    }
    return {
      images: [...merged.values()],
      completeness: successful.length === 2 ? "complete" : "partial",
    };
  }

  private async searchLane(
    bbox: [number, number, number, number],
    imageType?: "pano",
  ): Promise<StreetViewImage[]> {
    const url = new URL(`${GRAPH_URL}/images`);
    url.searchParams.set("access_token", this.accessToken);
    url.searchParams.set("fields", IMAGE_FIELDS);
    url.searchParams.set("bbox", bbox.join(","));
    url.searchParams.set("limit", String(CANDIDATE_LIMIT));
    if (imageType) url.searchParams.set("image_type", imageType);
    const payload = await this.readJson<{ data?: MapillaryImageJson[] }>(url);
    const images = (payload.data ?? [])
      .map(toImage)
      .filter((image): image is StreetViewImage => image !== null);
    return imageType === "pano" ? images.filter((image) => image.supports360) : images;
  }

  async getImage(imageId: string): Promise<StreetViewImage | null> {
    const url = new URL(`${GRAPH_URL}/${encodeURIComponent(imageId)}`);
    url.searchParams.set("access_token", this.accessToken);
    url.searchParams.set("fields", IMAGE_FIELDS);
    try {
      return toImage(await this.readJson<MapillaryImageJson>(url));
    } catch (error) {
      if (error instanceof StreetViewError && error.code === "street_view_image_not_found") return null;
      throw error;
    }
  }

  async readPreview(imageId: string): Promise<StreetViewPreview> {
    const image = await this.getImage(imageId);
    if (!image) {
      throw new StreetViewError("street_view_image_not_found", "Street-view image not found");
    }
    const response = await this.fetchWithTimeout(image.previewSource);
    if (!response.ok) throw upstreamError(response.status);
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!mediaType || !SUPPORTED_MEDIA.has(mediaType)) {
      throw new StreetViewError("street_view_unsupported_preview", "Unsupported street-view preview format");
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PREVIEW_BYTES) {
      throw new StreetViewError("street_view_preview_too_large", "Street-view preview exceeds 2 MiB");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PREVIEW_BYTES) {
      throw new StreetViewError("street_view_preview_too_large", "Street-view preview exceeds 2 MiB");
    }
    return { bytes, mediaType: mediaType as StreetViewPreview["mediaType"] };
  }

  getViewerConfig(): StreetViewViewerConfig {
    return { provider: "mapillary", accessToken: this.accessToken };
  }

  private async readJson<T>(url: URL): Promise<T> {
    const response = await this.fetchWithTimeout(url);
    if (!response.ok) throw upstreamError(response.status);
    try {
      return (await response.json()) as T;
    } catch {
      throw new StreetViewError("street_view_upstream_error", "Street-view provider returned invalid JSON");
    }
  }

  private async fetchWithTimeout(input: URL | string): Promise<Response> {
    try {
      return await this.fetchImpl(input, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new StreetViewError("street_view_timeout", "Street-view provider timed out");
      }
      throw new StreetViewError("street_view_upstream_error", "Street-view provider request failed");
    }
  }
}

function toImage(value: MapillaryImageJson): StreetViewImage | null {
  const coordinates = value.computed_geometry?.coordinates;
  if (!value.id || !coordinates || coordinates.length !== 2 || !value.thumb_1024_url) return null;
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: value.id,
    coordinate: { lat, lng },
    ...(value.captured_at ? { capturedAt: new Date(value.captured_at).toISOString() } : {}),
    ...(Number.isFinite(value.computed_compass_angle) ? { headingDegrees: value.computed_compass_angle } : {}),
    supports360: value.is_pano === true,
    previewSource: value.thumb_1024_url,
    attribution: { label: "Mapillary", url: "https://www.mapillary.com/" },
  };
}

function boundingBox(lat: number, lng: number, radiusMeters: number): [number, number, number, number] {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
}

function upstreamError(status: number): StreetViewError {
  if (status === 404) return new StreetViewError("street_view_image_not_found", "Street-view image not found");
  if (status === 429) return new StreetViewError("street_view_rate_limited", "Street-view provider rate limit reached");
  return new StreetViewError("street_view_upstream_error", "Street-view provider request failed");
}
