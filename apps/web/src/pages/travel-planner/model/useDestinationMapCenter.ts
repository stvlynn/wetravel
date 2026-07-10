import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { searchPlaces } from "@/shared/api";
import type { Trip } from "@/entities/trip";

export type MapCenter = { lat: number; lng: number };

/** Destination label from create intake or the first day city. */
export function tripDestinationHint(trip: Trip): string {
  const fromIntake = trip.intake?.destination?.trim();
  if (fromIntake) return fromIntake;
  const fromDay = trip.days.find((d) => d.city.trim())?.city.trim();
  return fromDay ?? "";
}

/** Prefer server-geocoded intake coords; otherwise Photon-geocode the label. */
export function useDestinationMapCenter(trip: Trip): MapCenter | null {
  const { i18n } = useTranslation("planner");
  const lang = i18n.resolvedLanguage ?? "en";

  const stored = storedDestinationCenter(trip);
  const query =
    !stored && trip.stops.length === 0 ? tripDestinationHint(trip) : "";
  const enabled = query.length >= 1;

  const { data } = useQuery({
    queryKey: ["trip-destination-center", trip.id, query, lang],
    queryFn: async ({ signal }) => {
      const results = await searchPlaces(query, { lang, limit: 1, signal });
      const first = results[0];
      return first ? { lat: first.lat, lng: first.lng } : null;
    },
    enabled,
    staleTime: 60 * 60_000,
  });

  if (stored) return stored;
  if (trip.stops.length > 0) return null;
  return data ?? null;
}

function storedDestinationCenter(trip: Trip): MapCenter | null {
  const lat = trip.intake?.destinationLat;
  const lng = trip.intake?.destinationLng;
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  return null;
}
