/** Vendor-neutral forecast granularity for the weather port. */
export type WeatherGranularity = "hourly" | "daily";

/** Query for a forecast window at a coordinate. */
export interface WeatherForecastQuery {
  lat: number;
  lon: number;
  /** Unix seconds (UTC) for the start of the requested window. */
  start: number;
  granularity: WeatherGranularity;
  lang: string;
  /** Number of records to request from the provider (adapter may clamp). */
  count?: number;
}

export interface WeatherConditionSnapshot {
  icon: string;
  main: string;
  description: string;
}

/** Daily aggregate temperatures when granularity is `daily`. */
export interface DailyTempSnapshot {
  day: number;
  min?: number;
  max?: number;
  night?: number;
  eve?: number;
  morn?: number;
}

export interface DailyFeelsLikeSnapshot {
  day: number;
  night?: number;
  eve?: number;
  morn?: number;
}

/** One forecast point (hour or day) in OpenTrip naming. */
export interface WeatherForecastEntry {
  /** Unix seconds (UTC). */
  dt: number;
  temp: number | DailyTempSnapshot;
  feelsLike: number | DailyFeelsLikeSnapshot;
  humidity: number;
  pressure: number;
  visibility?: number;
  windSpeed?: number;
  windDeg?: number;
  clouds?: number;
  conditions: WeatherConditionSnapshot[];
}

/** Provider-agnostic forecast payload returned by `WeatherClient`. */
export interface WeatherForecastSnapshot {
  lat: number;
  lon: number;
  timezone: string;
  /** Shift in seconds from UTC for the location. */
  timezoneOffset: number;
  entries: WeatherForecastEntry[];
}
