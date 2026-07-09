export interface WeatherCondition {
  id?: number;
  main: string;
  description: string;
  icon: string;
}

export interface DailyTemp {
  day: number;
  min?: number;
  max?: number;
  night?: number;
  eve?: number;
  morn?: number;
}

export interface DailyFeelsLike {
  day: number;
  night?: number;
  eve?: number;
  morn?: number;
}

/** One Call API 4.0 returns a unified `data` array for both hourly and daily
 * timelines. Hourly entries have scalar `temp`/`feels_like`; daily entries have
 * the aggregated objects. `weather` may be null when the provider has no
 * condition for that slot (e.g. sparse historical/timeline gaps). */
export interface TimelineEntry {
  dt: number;
  temp: number | DailyTemp;
  feels_like: number | DailyFeelsLike;
  pressure: number;
  humidity: number;
  wind_speed?: number;
  wind_deg?: number;
  clouds?: number;
  visibility?: number;
  weather: WeatherCondition[] | null;
}

export interface TimelineResponse {
  lat: number;
  lon: number;
  timezone: string;
  timezone_offset: number;
  data: TimelineEntry[];
  /** Present when the requested range spans more records than returned. */
  next?: string;
  prev?: string;
}
