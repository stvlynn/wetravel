import { WeatherError } from "../../application/weather/weather-error";
import type {
  WeatherClient,
  WeatherForecastEntry,
  WeatherForecastQuery,
  WeatherForecastSnapshot,
  WeatherGranularity,
} from "../../domain/weather";
import type { TimelineEntry, TimelineResponse } from "./onecall-types";

const GRANULARITY_TO_STEP: Record<WeatherGranularity, "1h" | "1day"> = {
  hourly: "1h",
  daily: "1day",
};

export class OpenWeatherMapClient implements WeatherClient {
  constructor(private apiKey: string | undefined) {}

  async fetchForecast(query: WeatherForecastQuery): Promise<WeatherForecastSnapshot> {
    if (!this.apiKey) {
      throw new WeatherError(
        "weather_not_configured",
        "OpenWeatherMap API key is not configured",
      );
    }

    const step = GRANULARITY_TO_STEP[query.granularity];
    const cnt = query.count ?? 10;
    const url = new URL(`https://api.openweathermap.org/data/4.0/onecall/timeline/${step}`);
    url.searchParams.set("lat", String(query.lat));
    url.searchParams.set("lon", String(query.lon));
    url.searchParams.set("start", String(query.start));
    url.searchParams.set("cnt", String(cnt));
    url.searchParams.set("appid", this.apiKey);
    url.searchParams.set("units", "metric");
    url.searchParams.set("lang", query.lang);

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      const logUrl = new URL(url);
      logUrl.searchParams.delete("appid");
      console.error("[OpenWeatherMap] upstream error", {
        url: logUrl.toString(),
        status: res.status,
        body,
      });
      throw new WeatherError("weather_failed", "Failed to fetch weather");
    }

    const raw = (await res.json()) as TimelineResponse;
    return mapTimelineResponse(raw);
  }
}

function mapTimelineResponse(raw: TimelineResponse): WeatherForecastSnapshot {
  return {
    lat: raw.lat,
    lon: raw.lon,
    timezone: raw.timezone,
    timezoneOffset: raw.timezone_offset,
    entries: (raw.data ?? []).map(mapTimelineEntry),
  };
}

function mapTimelineEntry(entry: TimelineEntry): WeatherForecastEntry {
  return {
    dt: entry.dt,
    temp: entry.temp,
    feelsLike: entry.feels_like,
    humidity: entry.humidity,
    pressure: entry.pressure,
    visibility: entry.visibility,
    windSpeed: entry.wind_speed,
    windDeg: entry.wind_deg,
    clouds: entry.clouds,
    conditions: (entry.weather ?? []).map((c) => ({
      icon: c.icon,
      main: c.main,
      description: c.description,
    })),
  };
}

/** Exported for unit tests that exercise vendor JSON edge cases. */
export { mapTimelineResponse };
