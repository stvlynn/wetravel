import type { Trip, TripSummary } from "@/entities/trip";
import { apiFetch } from "./client";

export interface CreateTripInput {
  title: string;
  destination?: string;
  dayCount?: number;
}

export function fetchTrips(): Promise<TripSummary[]> {
  return apiFetch<TripSummary[]>("/api/trips");
}

export function createTrip(input: CreateTripInput): Promise<Trip> {
  return apiFetch<Trip>("/api/trips", { method: "POST", data: input });
}

export function fetchTrip(tripId: string): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${encodeURIComponent(tripId)}`);
}

export function toggleVote(tripId: string, stopId: string): Promise<Trip> {
  return apiFetch<Trip>(
    `/api/trips/${encodeURIComponent(tripId)}/stops/${encodeURIComponent(stopId)}/vote`,
    { method: "POST" },
  );
}
