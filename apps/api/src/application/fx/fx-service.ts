import { DomainError } from "../../domain/shared/errors";
import type { FxClient } from "../../domain/fx";
import type { FxRatesData } from "./fx-data";

const CURRENCY_RE = /^[A-Za-z]{3}$/;

export class FxService {
  constructor(private client: FxClient) {}

  async getRates(
    base: string,
    quotes?: readonly string[],
    date?: string,
  ): Promise<FxRatesData> {
    const normalizedBase = normalizeCurrency(base);
    if (!normalizedBase) {
      throw new DomainError("invalid_currency", "base currency is required");
    }

    const normalizedQuotes = (quotes ?? [])
      .map(normalizeCurrency)
      .filter((c): c is string => Boolean(c));

    if (date !== undefined && date !== "" && !isValidYmd(date)) {
      throw new DomainError("invalid_date", "date must be YYYY-MM-DD");
    }

    const snapshot = await this.client.fetchRates({
      base: normalizedBase,
      quotes: normalizedQuotes.length > 0 ? normalizedQuotes : undefined,
      date: date?.trim() || undefined,
    });

    const rates: Record<string, number> = { [normalizedBase]: 1 };
    for (const row of snapshot.rates) {
      rates[row.quote] = row.rate;
    }

    return {
      date: snapshot.date,
      base: snapshot.base,
      provider: snapshot.provider,
      rates,
      fetchedAt: snapshot.fetchedAt,
    };
  }
}

function normalizeCurrency(value: string | undefined): string | null {
  const trimmed = value?.trim().toUpperCase() ?? "";
  if (!CURRENCY_RE.test(trimmed)) return null;
  return trimmed;
}

function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m! - 1 &&
    dt.getUTCDate() === d
  );
}
