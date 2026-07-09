import type {
  WeatherForecastQuery,
  WeatherForecastSnapshot,
} from "./types";

export type {
  WeatherGranularity,
  WeatherForecastQuery,
  WeatherForecastSnapshot,
  WeatherForecastEntry,
  WeatherConditionSnapshot,
  DailyTempSnapshot,
  DailyFeelsLikeSnapshot,
} from "./types";

/** Driven port: fetch a forecast snapshot for a coordinate and time window. */
export interface WeatherClient {
  fetchForecast(query: WeatherForecastQuery): Promise<WeatherForecastSnapshot>;
}
