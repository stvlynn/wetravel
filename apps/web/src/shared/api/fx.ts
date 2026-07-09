/** FX rates proxy client. The browser calls `/api/fx/rates`, which returns a
 * normalized rate table (Frankfurter behind the server). */

import { apiFetch } from "./client";

export interface FxRatesData {
  date: string;
  base: string;
  provider: string;
  /** Quote currency → units of quote per 1 base. Includes `base: 1`. */
  rates: Record<string, number>;
  fetchedAt: string;
}

export async function fetchFxRates(
  base: string,
  quotes?: readonly string[],
  { signal, date }: { signal?: AbortSignal; date?: string } = {},
): Promise<FxRatesData> {
  const url = new URL("/api/fx/rates", window.location.origin);
  url.searchParams.set("base", base);
  if (quotes && quotes.length > 0) {
    url.searchParams.set("quotes", quotes.join(","));
  }
  if (date) url.searchParams.set("date", date);

  return apiFetch<FxRatesData>(url.pathname + url.search, { signal });
}
