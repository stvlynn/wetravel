import type { Trip, TripSummary } from "@/entities/trip";
import type { StopCategory } from "@/entities/stop";
import { apiFetch } from "./client";

export function fetchTrips(): Promise<TripSummary[]> {
  return apiFetch<TripSummary[]>("/api/trips");
}

export interface CreateTripInput {
  title: string;
  currency?: string;
}

export function createTrip(input: CreateTripInput): Promise<Trip> {
  return apiFetch<Trip>("/api/trips", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function renameTrip(tripId: string, title: string): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function fetchTrip(id: string): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${id}`);
}

export function addTripDay(tripId: string): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/days`, { method: "POST" });
}

export interface InsertStopInput {
  day: number;
  index: number;
  name: string;
  time: string;
  lat?: number;
  lng?: number;
  area?: string;
  category?: StopCategory;
  cost?: number;
  costCurrency?: string;
  note?: string;
}

export function insertStop(tripId: string, input: InsertStopInput): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/stops`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function toggleVote(tripId: string, stopId: string): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/stops/${stopId}/vote`, {
    method: "POST",
  });
}

export function addComment(
  tripId: string,
  stopId: string,
  text: string,
): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/stops/${stopId}/comments`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export interface AddExpenseInput {
  description: string;
  amount: number;
  currency?: string;
  payer: string;
  participants: string[];
}

export function addExpense(tripId: string, input: AddExpenseInput): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/expenses`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
