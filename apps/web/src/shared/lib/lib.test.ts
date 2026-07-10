import { describe, expect, it } from "vitest";
import {
  convertMinorAmount,
  currencyDisplayName,
  currencyOptionLabel,
  formatConvertedMoney,
  formatFxRate,
  formatMoney,
  sumMinor,
} from "./money";
import { stopNumbers } from "@/entities/trip";
import type { Stop } from "@/entities/stop";

describe("formatMoney", () => {
  it("formats JPY with the yen symbol and grouped integer", () => {
    expect(formatMoney(120000, "JPY")).toBe("¥120,000");
  });

  it("rounds to whole units", () => {
    expect(formatMoney(2775.5, "JPY")).toBe("¥2,776");
  });
});

describe("currencyOptionLabel", () => {
  it("prefixes the ISO code with a localized name", () => {
    expect(currencyOptionLabel("JPY", "zh")).toMatch(/^JPY /);
    expect(currencyDisplayName("JPY", "zh")).toMatch(/日元|日圓/);
    expect(currencyOptionLabel("USD", "en")).toMatch(/USD .+Dollar/i);
  });
});

describe("convertMinorAmount", () => {
  const rates = { JPY: 1, USD: 0.00615, EUR: 0.00539 };

  it("returns the same amount when currencies match", () => {
    expect(convertMinorAmount(1000, "JPY", "JPY", rates, "JPY")).toBe(1000);
  });

  it("converts JPY to USD with two decimal places", () => {
    expect(convertMinorAmount(10000, "JPY", "USD", rates, "JPY")).toBe(61.5);
  });

  it("returns null when a quote is missing", () => {
    expect(convertMinorAmount(1000, "JPY", "GBP", rates, "JPY")).toBeNull();
  });
});

describe("formatConvertedMoney", () => {
  it("keeps JPY as a grouped integer", () => {
    expect(formatConvertedMoney(1200, "JPY")).toBe("¥1,200");
  });

  it("formats USD with two fraction digits", () => {
    expect(formatConvertedMoney(61.5, "USD")).toBe("$61.50");
  });
});

describe("formatFxRate", () => {
  it("formats a small rate with up to six fraction digits", () => {
    expect(formatFxRate("JPY", "USD", 0.00615)).toBe("1 JPY = 0.00615 USD");
  });
});

describe("sumMinor", () => {
  it("sums amounts", () => {
    expect(sumMinor([100, 200, 50])).toBe(350);
  });
});

describe("stopNumbers", () => {
  it("numbers stops sequentially within each day", () => {
    const stops = [
      { id: "a", day: 1 },
      { id: "b", day: 1 },
      { id: "c", day: 2 },
    ] as Stop[];
    const nums = stopNumbers(stops);
    expect(nums.get("a")).toBe(1);
    expect(nums.get("b")).toBe(2);
    expect(nums.get("c")).toBe(1);
  });
});
