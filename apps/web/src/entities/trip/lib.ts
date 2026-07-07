import type { Stop } from "@/entities/stop";
import type { Trip, TripDay } from "./model";

/** Sequential per-day stop numbers, matching the prototype `numsForStops`. */
export function stopNumbers(stops: readonly Stop[]): Map<string, number> {
  const counts = new Map<number, number>();
  const nums = new Map<string, number>();
  for (const stop of stops) {
    const next = (counts.get(stop.day) ?? 0) + 1;
    counts.set(stop.day, next);
    nums.set(stop.id, next);
  }
  return nums;
}

/** Stops for a given day (0 = all days), preserving order. */
export function stopsForDay(stops: readonly Stop[], day: number): Stop[] {
  if (day === 0) return [...stops];
  return stops.filter((s) => s.day === day);
}

export function dayColor(trip: Trip, day: number): string {
  return trip.days.find((d) => d.number === day)?.color ?? "#3f6fc9";
}

export function findDay(trip: Trip, day: number): TripDay | undefined {
  return trip.days.find((d) => d.number === day);
}

export interface MoveTripStopInput {
  stopId: string;
  day: number;
  /** Zero-based position within the target day's stops after removing the stop. */
  index: number;
}

/** Move a stop to a position within any itinerary day. Mirrors the server
 * aggregate so drag-and-drop can update optimistically before persistence
 * resolves. Returns the input trip unchanged when the target is invalid. */
export function moveTripStop(trip: Trip, input: MoveTripStopInput): Trip {
  if (!trip.days.some((d) => d.number === input.day)) return trip;
  const moving = trip.stops.find((s) => s.id === input.stopId);
  if (!moving) return trip;

  const rest = trip.stops.filter((s) => s.id !== input.stopId);
  const targetStops = rest.filter((s) => s.day === input.day);
  const index = Math.max(0, Math.min(input.index, targetStops.length));
  const prev = targetStops[index - 1];
  const next = targetStops[index];
  const moved: Stop = { ...moving, day: input.day };

  let pos: number;
  if (next) {
    pos = rest.indexOf(next);
  } else if (prev) {
    pos = rest.indexOf(prev) + 1;
  } else {
    const firstLaterDayStop = rest.find((s) => s.day > input.day);
    pos = firstLaterDayStop ? rest.indexOf(firstLaterDayStop) : rest.length;
  }

  const stops = [...rest];
  stops.splice(pos, 0, moved);
  return { ...trip, stops };
}

/** Day palette, cycled by day number. Mirrors the backend `DAY_COLORS`. */
const DAY_COLORS = [
  "#3f6fc9",
  "#305bb0",
  "#28304a",
  "#3c8f6f",
  "#6d788f",
  "#8a5cc0",
  "#c06a3c",
];

function dayColorFor(number: number): string {
  return DAY_COLORS[(number - 1) % DAY_COLORS.length]!;
}

/** Reorder itinerary days to the given sequence of current day numbers,
 * renumbering 1..N by position. Mirrors the server `Trip.reorderDays` so the
 * UI can update optimistically before the mutation resolves. Returns a new
 * Trip; the input is not mutated. `order` must be a permutation of the trip's
 * day numbers, otherwise the trip is returned unchanged. */
export function reorderTripDays(trip: Trip, order: number[]): Trip {
  const isPermutation =
    order.length === trip.days.length &&
    new Set(order).size === order.length &&
    order.every((n) => trip.days.some((d) => d.number === n));
  if (!isPermutation) return trip;

  const byNumber = new Map(trip.days.map((d) => [d.number, d]));
  const oldToNew = new Map<number, number>();
  const days: TripDay[] = order.map((oldNumber, i) => {
    const newNumber = i + 1;
    oldToNew.set(oldNumber, newNumber);
    const day = byNumber.get(oldNumber)!;
    return {
      number: newNumber,
      date: ISO_DATE.test(trip.startDate)
        ? addDaysIso(trip.startDate, newNumber - 1)
        : "",
      dateLabel: day.dateLabel,
      city: day.city,
      color: dayColorFor(newNumber),
    };
  });

  const stops = trip.stops
    .map((s, i) => ({ stop: s, i }))
    .map(({ stop, i }) => ({ stop: { ...stop, day: oldToNew.get(stop.day) ?? stop.day }, i }))
    .sort((a, b) => a.stop.day - b.stop.day || a.i - b.i)
    .map(({ stop }) => stop);

  return { ...trip, days, stops };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Human calendar date for a given itinerary day, localized to `locale`.
 * Uses the day's structured ISO date first; legacy text labels are fallback. */
export function dayDateLabel(
  trip: Trip,
  day: TripDay,
  locale: string,
): string {
  if (ISO_DATE.test(day.date)) return formatIsoDate(day.date, locale);
  if (day.dateLabel.trim()) return day.dateLabel;
  if (!ISO_DATE.test(trip.startDate)) return "";
  return formatIsoDate(addDaysIso(trip.startDate, day.number - 1), locale);
}

function formatIsoDate(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, "0"),
    String(dt.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
