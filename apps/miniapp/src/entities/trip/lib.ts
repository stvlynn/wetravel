import type { Trip, TripStop, TripSummary } from "./model";

export function stopsForDay(stops: TripStop[], dayNumber: number): TripStop[] {
  return stops.filter((stop) => stop.day === dayNumber);
}

export function toTripSummary(trip: Trip, createdAt: string): TripSummary {
  const firstLocatedStop = trip.stops.find(
    (stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng),
  );
  const lastDay = trip.days.at(-1);
  return {
    id: trip.id,
    title: trip.title,
    startLabel: trip.startDate,
    endLabel: lastDay?.date || lastDay?.dateLabel || "",
    status: trip.status,
    currency: trip.currency,
    coverColor: "#6174e8",
    coverUrl: trip.coverUrl,
    memberCount: trip.members.length,
    stopCount: trip.stops.length,
    createdAt,
    creatorName: trip.members[0]?.name ?? "",
    members: trip.members,
    location: firstLocatedStop
      ? { lat: firstLocatedStop.lat, lng: firstLocatedStop.lng }
      : null,
  };
}

export function mergeTripSummaries(
  fetched: TripSummary[],
  echoed: TripSummary[],
): TripSummary[] {
  const merged = new Map(fetched.map((trip) => [trip.id, trip]));
  for (const trip of echoed) merged.set(trip.id, trip);
  return [...merged.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
