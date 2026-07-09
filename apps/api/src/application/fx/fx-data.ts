/** Application DTO for a rate table used by the budget settle-up UI. */
export interface FxRatesData {
  date: string;
  base: string;
  provider: string;
  /** Map of quote currency → rate (units of quote per 1 base). */
  rates: Record<string, number>;
  fetchedAt: string;
}
