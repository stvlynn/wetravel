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

export function formatMoney(
  amount: number,
  currency = "JPY",
  locale = "en-US",
): string {
  const symbol = SYMBOLS[currency] ?? "";
  const grouped = Math.round(amount).toLocaleString(locale);
  return `${symbol}${grouped}`;
}

export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, n) => total + n, 0);
}
