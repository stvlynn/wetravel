import { GeoError } from "../../application/geo/geo-error";

export interface FetchJsonOptions {
  url: string | URL;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  errorCode?: string;
  errorMessage?: string;
}

/** Fetch JSON with AbortSignal timeout; maps non-2xx to GeoError. */
export async function fetchJson<T>(options: FetchJsonOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetch(options.url, {
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[geo] upstream error", {
        url: redactUrl(options.url),
        status: res.status,
        body: body.slice(0, 500),
      });
      throw new GeoError(
        options.errorCode ?? "geo_failed",
        options.errorMessage ?? "Failed to fetch geo data",
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof GeoError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new GeoError("geo_timeout", "Geo upstream request timed out");
    }
    throw new GeoError(
      options.errorCode ?? "geo_failed",
      options.errorMessage ?? "Failed to fetch geo data",
    );
  } finally {
    clearTimeout(timer);
  }
}

function redactUrl(url: string | URL): string {
  const parsed = new URL(typeof url === "string" ? url : url.toString());
  for (const key of ["key", "api_key", "apikey", "access_token"]) {
    if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "[redacted]");
  }
  return parsed.toString();
}
