import type { FxRatesQuery, FxRatesSnapshot } from "./types";

export type { FxRatesQuery, FxRatesSnapshot, FxRateRow } from "./types";

/** Driven port: fetch a rate table for a base currency. */
export interface FxClient {
  fetchRates(query: FxRatesQuery): Promise<FxRatesSnapshot>;
}
