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
  CHF: "CHF",
  NZD: "NZ$",
  INR: "₹",
  MYR: "RM",
  IDR: "Rp",
  PHP: "₱",
  VND: "₫",
  MOP: "MOP$",
  AED: "AED",
  SAR: "SAR",
  TRY: "₺",
  MXN: "MX$",
  BRL: "R$",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  PLN: "zł",
  ILS: "₪",
  ZAR: "R",
};

/** Preferred order for travel-oriented pickers (head of the full list). */
const PREFERRED_CURRENCIES = [
  "JPY",
  "CNY",
  "USD",
  "EUR",
  "GBP",
  "KRW",
  "TWD",
  "HKD",
  "SGD",
  "THB",
  "AUD",
  "CAD",
  "CHF",
  "NZD",
  "INR",
  "MYR",
  "IDR",
  "PHP",
  "VND",
  "MOP",
  "AED",
  "SAR",
  "TRY",
  "MXN",
  "BRL",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "ILS",
  "ZAR",
  "EGP",
  "QAR",
  "KWD",
  "BHD",
  "PKR",
  "BDT",
  "LKR",
  "KHR",
  "LAK",
  "MMK",
  "BND",
  "FJD",
  "NPR",
  "ARS",
  "CLP",
  "COP",
  "PEN",
  "ISK",
  "BGN",
  "UAH",
  "NGN",
  "KES",
  "GHS",
  "MAD",
] as const;

/** Fallback when `Intl.supportedValuesOf('currency')` is unavailable. */
const FALLBACK_CURRENCIES: readonly string[] = [
  ...PREFERRED_CURRENCIES,
  "RUB",
  "HRK",
  "KZT",
  "UZS",
  "UYU",
  "TND",
  "OMR",
];

function buildCurrencyList(): readonly string[] {
  const supported =
    typeof Intl !== "undefined" &&
    "supportedValuesOf" in Intl &&
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("currency")
      : [...FALLBACK_CURRENCIES];
  const available = new Set(supported);
  const head = PREFERRED_CURRENCIES.filter((c) => available.has(c));
  const preferred = new Set<string>(PREFERRED_CURRENCIES);
  const tail = supported.filter((c) => !preferred.has(c)).sort();
  return Object.freeze([...head, ...tail]);
}

/** Currencies offered in the app's currency pickers (runtime ISO 4217 set when
 * available, preferred travel currencies first). */
export const CURRENCIES: readonly string[] = buildCurrencyList();

/** Quotes requested for settle-up FX. Prefer the travel-oriented head list so
 * the request stays bounded; unsupported codes simply omit from rates. */
export const FX_QUOTE_CURRENCIES: readonly string[] = [...PREFERRED_CURRENCIES];

/** Localized currency name for `code`, e.g. `日元` / `Japanese Yen`. */
export function currencyDisplayName(code: string, locale: string): string {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return code;
  try {
    const name = new Intl.DisplayNames([locale], { type: "currency" }).of(
      normalized,
    );
    return name?.trim() || normalized;
  } catch {
    return normalized;
  }
}

/** Picker label: `JPY 日元` / `JPY Japanese Yen`. */
export function currencyOptionLabel(code: string, locale: string): string {
  const normalized = code.trim().toUpperCase();
  const name = currencyDisplayName(normalized, locale);
  return name && name !== normalized ? `${normalized} ${name}` : normalized;
}

/** Base UI Select `items` for the shared currency list. */
export function currencySelectItems(
  locale: string,
): Array<{ value: string; label: string }> {
  return CURRENCIES.map((value) => ({
    value,
    label: currencyOptionLabel(value, locale),
  }));
}

/** Currencies that use zero decimal places in ISO 4217 (minor unit = major). */
const ZERO_DECIMAL = new Set([
  "JPY",
  "KRW",
  "TWD",
  "VND",
  "CLP",
  "ISK",
  "UGX",
  "PYG",
  "XAF",
  "XOF",
  "XPF",
]);

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
