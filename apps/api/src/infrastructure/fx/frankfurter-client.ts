import type {
  FxClient,
  FxRateRow,
  FxRatesQuery,
  FxRatesSnapshot,
} from "../../domain/fx";
import { FxError } from "../../application/fx/fx-error";

const DEFAULT_BASE_URL = "https://api.frankfurter.dev";
const PROVIDER = "frankfurter";

interface FrankfurterRateRow {
  date?: string;
  base?: string;
  quote?: string;
  rate?: number;
}

/** Frankfurter v2 adapter. No API key; daily central-bank reference rates. */
export class FrankfurterClient implements FxClient {
  constructor(private baseUrl: string = DEFAULT_BASE_URL) {}

  async fetchRates(query: FxRatesQuery): Promise<FxRatesSnapshot> {
    const url = new URL("/v2/rates", this.baseUrl);
    url.searchParams.set("base", query.base);
    if (query.quotes && query.quotes.length > 0) {
      url.searchParams.set("quotes", query.quotes.join(","));
    }
    if (query.date) {
      url.searchParams.set("date", query.date);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      throw new FxError(
        "fx_upstream_unreachable",
        err instanceof Error ? err.message : "Frankfurter unreachable",
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new FxError(
        "fx_upstream_error",
        `Frankfurter ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!Array.isArray(payload)) {
      throw new FxError("fx_upstream_error", "Frankfurter returned unexpected JSON");
    }

    const rates: FxRateRow[] = [];
    let date = query.date ?? "";
    for (const item of payload as FrankfurterRateRow[]) {
      if (
        typeof item.quote !== "string" ||
        typeof item.rate !== "number" ||
        !Number.isFinite(item.rate)
      ) {
        continue;
      }
      if (typeof item.date === "string" && item.date) date = item.date;
      rates.push({
        date: typeof item.date === "string" ? item.date : date,
        base: typeof item.base === "string" ? item.base : query.base,
        quote: item.quote.toUpperCase(),
        rate: item.rate,
      });
    }

    if (!date && rates[0]?.date) date = rates[0].date;
    if (!date) date = new Date().toISOString().slice(0, 10);

    return {
      date,
      base: query.base,
      provider: PROVIDER,
      rates,
      fetchedAt: new Date().toISOString(),
    };
  }
}
