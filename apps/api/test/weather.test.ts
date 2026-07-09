import { describe, expect, it, vi } from "vitest";
import { WeatherService } from "../src/application/weather/weather-service";
import type {
  WeatherClient,
  WeatherForecastQuery,
  WeatherForecastSnapshot,
} from "../src/domain/weather";
import { CachedWeatherClient } from "../src/infrastructure/weather/cached-weather-client";
import { mapTimelineResponse } from "../src/infrastructure/weather/openweather-client";

function snapshot(
  overrides: Partial<WeatherForecastSnapshot> = {},
): WeatherForecastSnapshot {
  return {
    lat: 35.68,
    lon: 139.76,
    timezone: "Asia/Tokyo",
    timezoneOffset: 9 * 3600,
    entries: [
      {
        dt: Date.UTC(2026, 6, 15) / 1000,
        temp: { day: 28 },
        feelsLike: { day: 30 },
        humidity: 60,
        pressure: 1012,
        windSpeed: 3,
        windDeg: 90,
        clouds: 20,
        conditions: [
          {
            icon: "01d",
            main: "Clear",
            description: "clear sky",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function hourlySnapshot(targetUnix: number): WeatherForecastSnapshot {
  return {
    lat: 35.68,
    lon: 139.76,
    timezone: "Asia/Tokyo",
    timezoneOffset: 0,
    entries: [
      {
        dt: targetUnix,
        temp: 22.5,
        feelsLike: 21,
        humidity: 55,
        pressure: 1010,
        visibility: 9000,
        windSpeed: 2,
        windDeg: 180,
        clouds: 10,
        conditions: [
          {
            icon: "02d",
            main: "Clouds",
            description: "few clouds",
          },
        ],
      },
    ],
  };
}

describe("WeatherService", () => {
  it("maps a daily forecast entry to WeatherData", async () => {
    const client: WeatherClient = {
      fetchForecast: vi.fn(async () => snapshot()),
    };
    const service = new WeatherService(client);

    const result = await service.getWeather(35.68, 139.76, "2026-07-15");

    expect(result).toEqual({
      icon: "01d",
      main: "Clear",
      description: "clear sky",
      temp: 28,
      feelsLike: 30,
      humidity: 60,
      pressure: 1012,
      visibility: 10_000,
      windSpeed: 3,
      windDeg: 90,
      clouds: 20,
    });
    expect(client.fetchForecast).toHaveBeenCalledWith(
      expect.objectContaining({
        granularity: "daily",
        lat: 35.68,
        lon: 139.76,
      }),
    );
  });

  it("prefers hourly when time is within the hourly horizon", async () => {
    const targetUnix = Math.floor(Date.now() / 1000) + 3600;
    const client: WeatherClient = {
      fetchForecast: vi.fn(async (query: WeatherForecastQuery) => {
        if (query.granularity === "hourly") {
          return hourlySnapshot(targetUnix);
        }
        return snapshot();
      }),
    };
    const service = new WeatherService(client);
    const date = new Date(targetUnix * 1000).toISOString().slice(0, 10);
    const hour = String(new Date(targetUnix * 1000).getUTCHours()).padStart(2, "0");
    const minute = String(new Date(targetUnix * 1000).getUTCMinutes()).padStart(
      2,
      "0",
    );

    const result = await service.getWeather(
      35.68,
      139.76,
      date,
      `${hour}:${minute}`,
    );

    expect(result?.temp).toBe(22.5);
    expect(result?.icon).toBe("02d");
    expect(client.fetchForecast).toHaveBeenCalledWith(
      expect.objectContaining({ granularity: "hourly", count: 20 }),
    );
  });

  it("returns null for invalid or missing date", async () => {
    const client: WeatherClient = {
      fetchForecast: vi.fn(),
    };
    const service = new WeatherService(client);

    expect(await service.getWeather(35.68, 139.76)).toBeNull();
    expect(await service.getWeather(35.68, 139.76, "not-a-date")).toBeNull();
    expect(client.fetchForecast).not.toHaveBeenCalled();
  });

  it("returns null when the matched entry has no conditions", async () => {
    const client: WeatherClient = {
      fetchForecast: vi.fn(async () =>
        snapshot({
          entries: [
            {
              dt: Date.UTC(2026, 6, 15) / 1000,
              temp: { day: 28 },
              feelsLike: { day: 30 },
              humidity: 60,
              pressure: 1012,
              conditions: [],
            },
          ],
        }),
      ),
    };
    const service = new WeatherService(client);

    expect(await service.getWeather(35.68, 139.76, "2026-07-15")).toBeNull();
  });
});

describe("mapTimelineResponse", () => {
  it("tolerates null weather arrays from the provider", () => {
    const snapshot = mapTimelineResponse({
      lat: 35.71,
      lon: 139.8,
      timezone: "Asia/Tokyo",
      timezone_offset: 9 * 3600,
      data: [
        {
          dt: 1_760_227_200,
          temp: { day: 22 },
          feels_like: { day: 21 },
          humidity: 50,
          pressure: 1013,
          weather: null,
        },
        {
          dt: 1_760_313_600,
          temp: { day: 24 },
          feels_like: { day: 23 },
          humidity: 55,
          pressure: 1012,
          weather: [{ icon: "01d", main: "Clear", description: "clear sky" }],
        },
      ],
    });

    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0]?.conditions).toEqual([]);
    expect(snapshot.entries[1]?.conditions[0]?.icon).toBe("01d");
  });

  it("tolerates a missing data array", () => {
    const snapshot = mapTimelineResponse({
      lat: 0,
      lon: 0,
      timezone: "UTC",
      timezone_offset: 0,
      data: undefined as unknown as [],
    });
    expect(snapshot.entries).toEqual([]);
  });
});

describe("CachedWeatherClient", () => {
  it("returns a cached hit without calling the inner client again", async () => {
    const inner: WeatherClient = {
      fetchForecast: vi.fn(async () => snapshot({ lat: 1 })),
    };
    const cached = new CachedWeatherClient(inner, 60_000);
    const query: WeatherForecastQuery = {
      lat: 35.681,
      lon: 139.767,
      start: 1_720_000_000,
      granularity: "daily",
      lang: "en",
      count: 10,
    };

    const first = await cached.fetchForecast(query);
    const second = await cached.fetchForecast({
      ...query,
      lat: 35.6812, // rounds to the same cache key
    });

    expect(first).toBe(second);
    expect(inner.fetchForecast).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent misses into one upstream call", async () => {
    let resolveUpstream!: (value: WeatherForecastSnapshot) => void;
    const upstream = new Promise<WeatherForecastSnapshot>((resolve) => {
      resolveUpstream = resolve;
    });
    const inner: WeatherClient = {
      fetchForecast: vi.fn(() => upstream),
    };
    const cached = new CachedWeatherClient(inner, 60_000);
    const query: WeatherForecastQuery = {
      lat: 35.68,
      lon: 139.76,
      start: 1_720_000_000,
      granularity: "hourly",
      lang: "en",
      count: 20,
    };

    const p1 = cached.fetchForecast(query);
    const p2 = cached.fetchForecast(query);
    resolveUpstream(snapshot({ lon: 2 }));
    const [a, b] = await Promise.all([p1, p2]);

    expect(a).toBe(b);
    expect(inner.fetchForecast).toHaveBeenCalledTimes(1);
  });

  it("serves stale data while refreshing after TTL expiry", async () => {
    const fresh = snapshot({ lat: 99 });
    const inner: WeatherClient = {
      fetchForecast: vi
        .fn()
        .mockResolvedValueOnce(snapshot({ lat: 1 }))
        .mockResolvedValueOnce(fresh),
    };
    const cached = new CachedWeatherClient(inner, 1);
    const query: WeatherForecastQuery = {
      lat: 35.68,
      lon: 139.76,
      start: 1_720_000_000,
      granularity: "daily",
      lang: "en",
      count: 10,
    };

    const first = await cached.fetchForecast(query);
    await new Promise((r) => setTimeout(r, 5));
    const stale = await cached.fetchForecast(query);

    expect(stale.lat).toBe(first.lat);
    await vi.waitFor(() => {
      expect(inner.fetchForecast).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps serving stale data when background refresh fails", async () => {
    const inner: WeatherClient = {
      fetchForecast: vi
        .fn()
        .mockResolvedValueOnce(snapshot({ lat: 7 }))
        .mockRejectedValueOnce(new Error("upstream down")),
    };
    const cached = new CachedWeatherClient(inner, 1);
    const query: WeatherForecastQuery = {
      lat: 35.68,
      lon: 139.76,
      start: 1_720_000_000,
      granularity: "daily",
      lang: "en",
      count: 10,
    };

    const first = await cached.fetchForecast(query);
    await new Promise((r) => setTimeout(r, 5));
    const stale = await cached.fetchForecast(query);

    expect(stale.lat).toBe(7);
    expect(stale).toEqual(first);
    await vi.waitFor(() => {
      expect(inner.fetchForecast).toHaveBeenCalledTimes(2);
    });
  });
});
