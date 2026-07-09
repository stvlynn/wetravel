/** Query for a latest (or dated) FX rate table against a base currency. */
export interface FxRatesQuery {
  /** ISO 4217 base currency, e.g. `JPY`. */
  base: string;
  /** Optional ISO 4217 quote currencies. Empty means provider default set. */
  quotes?: readonly string[];
  /** Optional ISO date `YYYY-MM-DD`. Omit for the latest available day. */
  date?: string;
}

/** One base→quote rate row from a provider. */
export interface FxRateRow {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

/** Snapshot returned by an FX provider for a query. */
export interface FxRatesSnapshot {
  date: string;
  base: string;
  provider: string;
  rates: readonly FxRateRow[];
  fetchedAt: string;
}
