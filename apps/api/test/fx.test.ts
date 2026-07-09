import { describe, expect, it, vi } from "vitest";
import { FxService } from "../src/application/fx/fx-service";
import type { FxClient, FxRatesSnapshot } from "../src/domain/fx";
import { CachedFxClient } from "../src/infrastructure/fx/cached-fx-client";

function snapshot(
  overrides: Partial<FxRatesSnapshot> = {},
): FxRatesSnapshot {
  return {
    date: "2026-07-10",
    base: "JPY",
    provider: "frankfurter",
    rates: [
      { date: "2026-07-10", base: "JPY", quote: "USD", rate: 0.00615 },
      { date: "2026-07-10", base: "JPY", quote: "EUR", rate: 0.00539 },
    ],
    fetchedAt: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("FxService", () => {
  it("maps a rate snapshot to FxRatesData with identity rate for base", async () => {
    const client: FxClient = {
      fetchRates: vi.fn(async () => snapshot()),
    };
    const service = new FxService(client);

    const result = await service.getRates("jpy", ["usd", "eur"]);

    expect(result).toEqual({
      date: "2026-07-10",
      base: "JPY",
      provider: "frankfurter",
      rates: { JPY: 1, USD: 0.00615, EUR: 0.00539 },
      fetchedAt: "2026-07-10T12:00:00.000Z",
    });
    expect(client.fetchRates).toHaveBeenCalledWith({
      base: "JPY",
      quotes: ["USD", "EUR"],
      date: undefined,
    });
  });

  it("rejects an invalid base currency", async () => {
    const client: FxClient = { fetchRates: vi.fn() };
    const service = new FxService(client);
    await expect(service.getRates("JP")).rejects.toMatchObject({
      code: "invalid_currency",
    });
  });
});

describe("CachedFxClient", () => {
  it("serves a cached snapshot within TTL", async () => {
    const inner: FxClient = {
      fetchRates: vi.fn(async () => snapshot()),
    };
    const cached = new CachedFxClient(inner, 60_000);

    const first = await cached.fetchRates({ base: "JPY", quotes: ["USD"] });
    const second = await cached.fetchRates({ base: "JPY", quotes: ["USD"] });

    expect(first).toEqual(second);
    expect(inner.fetchRates).toHaveBeenCalledTimes(1);
  });
});
