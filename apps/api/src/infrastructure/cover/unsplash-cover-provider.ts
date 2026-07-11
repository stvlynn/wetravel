import type { CoverImageProvider } from "../../domain/cover/ports";

interface UnsplashSearchResponse {
  results?: Array<{
    urls?: { regular?: string };
  }>;
}

/** Unsplash Search API adapter for trip cover images. Returns null when the
 * access key is missing, the query is empty, or the request fails. */
export class UnsplashCoverProvider implements CoverImageProvider {
  constructor(private accessKey: string | undefined) {}

  async searchLandscape(query: string): Promise<string | null> {
    const q = query.trim();
    if (!this.accessKey) {
      console.warn("[cover] UNSPLASH_ACCESS_KEY unset; skipping cover fetch");
      return null;
    }
    if (!q) return null;

    const params = new URLSearchParams({
      query: `${q} landscape travel`,
      orientation: "landscape",
      per_page: "1",
      content_filter: "high",
    });

    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?${params.toString()}`,
        {
          headers: {
            Authorization: `Client-ID ${this.accessKey}`,
            "Accept-Version": "v1",
          },
        },
      );
      if (!res.ok) {
        console.warn(
          `[cover] Unsplash search failed: ${res.status} ${res.statusText}`,
        );
        return null;
      }
      const body = (await res.json()) as UnsplashSearchResponse;
      const url = body.results?.[0]?.urls?.regular?.trim();
      if (!url) {
        console.warn(`[cover] Unsplash returned no photos for query=${q}`);
      }
      return url || null;
    } catch (err) {
      console.warn("[cover] Unsplash request error", err);
      return null;
    }
  }
}
