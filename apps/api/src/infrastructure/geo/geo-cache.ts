/**
 * In-memory cache with single-flight and stale-while-revalidate,
 * mirroring CachedWeatherClient for geo upstream calls.
 */
export class GeoCache {
  private cache = new Map<string, { value: unknown; expiresAt: number }>();
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(private ttlMs: number) {}

  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const stale = cached?.value as T | undefined;
    const refresh = this.startRefresh(key, loader);

    if (stale !== undefined) {
      refresh.catch(() => {});
      return stale;
    }

    return refresh;
  }

  private startRefresh<T>(key: string, loader: () => Promise<T>): Promise<T> {
    let refresh = this.inFlight.get(key) as Promise<T> | undefined;
    if (!refresh) {
      refresh = loader()
        .then((value) => {
          this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
          return value;
        })
        .finally(() => {
          this.inFlight.delete(key);
        });
      this.inFlight.set(key, refresh);
    }
    return refresh;
  }
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}
