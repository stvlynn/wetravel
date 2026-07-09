import type {
  WeatherClient,
  WeatherForecastQuery,
  WeatherForecastSnapshot,
  WeatherGranularity,
} from "../../domain/weather";

interface CacheEntry {
  value: WeatherForecastSnapshot;
  expiresAt: number;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const HOURLY_BUCKET_SECONDS = 60 * 60; // 1 h
const DAILY_BUCKET_SECONDS = 10 * 24 * 60 * 60; // 10 days

export class CachedWeatherClient implements WeatherClient {
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<WeatherForecastSnapshot>>();

  constructor(
    private client: WeatherClient,
    private ttlMs: number = ONE_HOUR_MS,
  ) {}

  async fetchForecast(query: WeatherForecastQuery): Promise<WeatherForecastSnapshot> {
    const cacheStart = bucketStart(query.granularity, query.start);
    const count = query.count ?? 10;
    const key = [
      query.granularity,
      roundCoordinate(query.lat),
      roundCoordinate(query.lon),
      cacheStart,
      query.lang,
      count,
    ].join(":");

    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const stale = cached?.value;
    const refresh = this.startRefresh(key, {
      ...query,
      start: cacheStart,
      count,
    });

    if (stale) {
      // Return the stale response immediately and refresh in the background.
      // If the refresh fails, we keep serving the stale entry until it succeeds.
      refresh.catch(() => {});
      return stale;
    }

    return refresh;
  }

  private startRefresh(
    key: string,
    query: WeatherForecastQuery,
  ): Promise<WeatherForecastSnapshot> {
    let refresh = this.inFlight.get(key);
    if (!refresh) {
      refresh = this.client
        .fetchForecast(query)
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

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function bucketStart(granularity: WeatherGranularity, start: number): number {
  if (granularity === "hourly") {
    return Math.floor(start / HOURLY_BUCKET_SECONDS) * HOURLY_BUCKET_SECONDS;
  }
  return Math.floor(start / DAILY_BUCKET_SECONDS) * DAILY_BUCKET_SECONDS;
}
