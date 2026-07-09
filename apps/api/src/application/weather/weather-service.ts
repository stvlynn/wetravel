import { DomainError } from "../../domain/shared/errors";
import type {
  WeatherClient,
  WeatherForecastEntry,
  WeatherForecastSnapshot,
} from "../../domain/weather";
import type { WeatherData } from "./weather-data";

const HOURLY_HORIZON_SECONDS = 48 * 60 * 60;
const DAILY_MAX_FUTURE_DAYS = 548; // ~1.5 years
const DAILY_MAX_PAST_DAYS = 365 * 5;
const HOURLY_RECORDS = 20;
const DAILY_RECORDS = 10;

export class WeatherService {
  constructor(private client: WeatherClient) {}

  async getWeather(
    lat: number,
    lon: number,
    date?: string,
    time?: string,
    lang = "en",
  ): Promise<WeatherData | null> {
    if (
      Number.isNaN(lat) ||
      Number.isNaN(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      throw new DomainError("invalid_coordinates", "lat and lon are invalid");
    }

    const targetDate = date?.trim();
    if (!targetDate || !isValidYmd(targetDate)) {
      return null;
    }

    if (!isWithinSupportedWindow(targetDate)) {
      return null;
    }

    const normalizedTime = parseTime(time?.trim());
    const targetLocalMs = localDateTimeToMs(targetDate, normalizedTime);
    if (Number.isNaN(targetLocalMs)) {
      return null;
    }

    const naiveTargetUtc = Math.floor(targetLocalMs / 1000);
    const nowUtc = Math.floor(Date.now() / 1000);

    if (
      normalizedTime &&
      naiveTargetUtc <= nowUtc + HOURLY_HORIZON_SECONDS
    ) {
      const response = await this.client.fetchForecast({
        lat,
        lon,
        start: naiveTargetUtc - 10 * 60 * 60, // center a 20-record window around the target
        granularity: "hourly",
        lang: normalizeLang(lang),
        count: HOURLY_RECORDS,
      });
      const match = findNearestHourly(response, targetLocalMs);
      if (match) {
        return mapEntry(match);
      }
    }

    const response = await this.client.fetchForecast({
      lat,
      lon,
      start: Math.floor(targetLocalMs / 1000), // start at the requested day interpreted as UTC; we match by local date below
      granularity: "daily",
      lang: normalizeLang(lang),
      count: DAILY_RECORDS,
    });
    const match = findDaily(response, targetDate);
    return match ? mapEntry(match) : null;
  }
}

function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase();
  if (lower.startsWith("zh")) return "zh_cn";
  return lower.split("-")[0] ?? "en";
}

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isWithinSupportedWindow(date: string): boolean {
  const now = new Date();
  const minDate = formatUtcDate(
    new Date(now.getTime() - DAILY_MAX_PAST_DAYS * 24 * 60 * 60 * 1000),
  );
  const maxDate = formatUtcDate(
    new Date(now.getTime() + DAILY_MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000),
  );
  return date >= minDate && date <= maxDate;
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseTime(time: string | undefined): { hour: number; minute: number } | null {
  if (!time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function localDateTimeToMs(
  date: string,
  time: { hour: number; minute: number } | null,
): number {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = time?.hour ?? 0;
  const minute = time?.minute ?? 0;
  return Date.UTC(year, month - 1, day, hour, minute);
}

function entryLocalMs(entry: WeatherForecastEntry, offsetSeconds: number): number {
  return (entry.dt + offsetSeconds) * 1000;
}

function findNearestHourly(
  response: WeatherForecastSnapshot,
  targetLocalMs: number,
): WeatherForecastEntry | null {
  if (response.entries.length === 0) return null;

  let nearest = response.entries[0]!;
  let minDistance = Math.abs(
    entryLocalMs(nearest, response.timezoneOffset) - targetLocalMs,
  );

  for (const entry of response.entries) {
    const distance = Math.abs(
      entryLocalMs(entry, response.timezoneOffset) - targetLocalMs,
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearest = entry;
    }
  }

  return nearest;
}

function findDaily(
  response: WeatherForecastSnapshot,
  date: string,
): WeatherForecastEntry | null {
  for (const entry of response.entries) {
    const localYmd = new Date(
      (entry.dt + response.timezoneOffset) * 1000,
    )
      .toISOString()
      .slice(0, 10);
    if (localYmd === date) {
      return entry;
    }
  }
  return null;
}

function mapEntry(entry: WeatherForecastEntry): WeatherData | null {
  const condition = entry.conditions[0];
  if (!condition) return null;

  const temp = extractTemp(entry);
  const feelsLike = extractFeelsLike(entry);
  if (Number.isNaN(temp) || Number.isNaN(feelsLike)) return null;

  return {
    icon: condition.icon,
    main: condition.main,
    description: condition.description,
    temp,
    feelsLike,
    humidity: entry.humidity,
    pressure: entry.pressure,
    visibility: entry.visibility ?? 10_000,
    windSpeed: entry.windSpeed ?? 0,
    windDeg: entry.windDeg ?? 0,
    clouds: entry.clouds ?? 0,
  };
}

function extractTemp(entry: WeatherForecastEntry): number {
  return typeof entry.temp === "number" ? entry.temp : entry.temp.day;
}

function extractFeelsLike(entry: WeatherForecastEntry): number {
  return typeof entry.feelsLike === "number"
    ? entry.feelsLike
    : entry.feelsLike.day;
}
