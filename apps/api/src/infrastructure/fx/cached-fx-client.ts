import type {
  FxClient,
  FxRatesQuery,
  FxRatesSnapshot,
} from "../../domain/fx";

interface CacheEntry {
  value: FxRatesSnapshot;
  expiresAt: number;
}

/** Daily reference rates change once per business day; cache for 6h with SWR. */
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export class CachedFxClient implements FxClient {
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<FxRatesSnapshot>>();

  constructor(
    private client: FxClient,
    private ttlMs: number = SIX_HOURS_MS,
  ) {}

  async fetchRates(query: FxRatesQuery): Promise<FxRatesSnapshot> {
    const quotesKey = [...(query.quotes ?? [])].map((c) => c.toUpperCase()).sort().join(",");
    const key = [query.base.toUpperCase(), quotesKey, query.date ?? "latest"].join(":");

    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const stale = cached?.value;
    const refresh = this.startRefresh(key, query);

    if (stale) {
      refresh.catch(() => {});
      return stale;
    }

    return refresh;
  }

  private startRefresh(
    key: string,
    query: FxRatesQuery,
  ): Promise<FxRatesSnapshot> {
    let refresh = this.inFlight.get(key);
    if (!refresh) {
      refresh = this.client
        .fetchRates(query)
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
