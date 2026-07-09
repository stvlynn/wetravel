/** Money helpers. Amounts are integer minor units; JPY has no sub-unit so the
 * integer is the yen value. Mirrors the prototype `yen()` output (`¥` + grouped
 * integer) while staying locale-aware for grouping. */
const SYMBOLS: Record<string, string> = {
  JPY: "¥",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CNY: "¥",
  KRW: "₩",
  TWD: "NT$",
  HKD: "HK$",
  SGD: "S$",
  THB: "฿",
  AUD: "A$",
  CAD: "C$",
};

/** Currencies offered in the app's currency pickers, in display order. */
export const CURRENCIES: readonly string[] = [
  "JPY",
  "USD",
  "EUR",
  "GBP",
  "CNY",
  "KRW",
  "TWD",
  "HKD",
  "SGD",
  "THB",
  "AUD",
  "CAD",
];

/** Currencies that use zero decimal places in ISO 4217 (minor unit = major). */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "TWD"]);

export function formatMoney(
  amount: number,
  currency = "JPY",
  locale = "en-US",
): string {
  const symbol = SYMBOLS[currency] ?? "";
  const grouped = Math.round(amount).toLocaleString(locale);
  return `${symbol}${grouped}`;
}

/** Convert an integer amount from `fromCurrency` to `toCurrency` using a rate
 * table keyed as quote → units of quote per 1 `base`. When either currency is
 * missing from the table (and is not the base), returns `null`. */
export function convertMinorAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
  base: string,
): number | null {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return Math.round(amount);

  const fromRate = from === base.toUpperCase() ? 1 : rates[from];
  const toRate = to === base.toUpperCase() ? 1 : rates[to];
  if (fromRate == null || toRate == null || fromRate === 0) return null;

  // amount_in_base = amount / fromRate; amount_in_to = amount_in_base * toRate
  const converted = (amount / fromRate) * toRate;
  if (ZERO_DECIMAL.has(to)) return Math.round(converted);
  return Math.round(converted * 100) / 100;
}

/** Format a converted settlement amount. Zero-decimal currencies stay integers;
 * others show two fraction digits so small FX amounts remain readable. */
export function formatConvertedMoney(
  amount: number,
  currency: string,
  locale = "en-US",
): string {
  const symbol = SYMBOLS[currency] ?? "";
  if (ZERO_DECIMAL.has(currency)) {
    return `${symbol}${Math.round(amount).toLocaleString(locale)}`;
  }
  const grouped = amount.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${grouped}`;
}

/** Human-readable FX rate line, e.g. `1 JPY = 0.00615 USD`. */
export function formatFxRate(
  base: string,
  quote: string,
  rate: number,
  locale = "en-US",
): string {
  const digits = rate >= 1 ? 4 : 6;
  const formatted = rate.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
  return `1 ${base} = ${formatted} ${quote}`;
}

export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, n) => total + n, 0);
}
