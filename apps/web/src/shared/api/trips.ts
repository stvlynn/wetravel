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

export function deleteTripDay(tripId: string, dayNumber: number): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/days/${dayNumber}`, {
    method: "DELETE",
  });
}

export interface UpdateTripDayInput {
  date?: string;
  dateLabel?: string;
  city?: string;
  color?: string;
}

export function updateTripDay(
  tripId: string,
  dayNumber: number,
  input: UpdateTripDayInput,
): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/days/${dayNumber}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Reorder itinerary days to the given sequence of current day numbers. */
export function reorderTripDays(
  tripId: string,
  order: number[],
): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/days/order`, {
    method: "PUT",
    body: JSON.stringify({ order }),
  });
}

export interface InsertStopInput {
  day: number;
  index: number;
  name: string;
  time: string;
  duration?: string;
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

export interface UpdateStopInput {
  name?: string;
  time?: string;
  duration?: string;
  area?: string;
  category?: StopCategory;
  cost?: number;
  costCurrency?: string;
  note?: string;
}

export function updateStop(
  tripId: string,
  stopId: string,
  input: UpdateStopInput,
): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/stops/${stopId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export interface MoveStopInput {
  day: number;
  /** Zero-based position within the target day's stops after removing the stop. */
  index: number;
}

export function moveStop(
  tripId: string,
  stopId: string,
  input: MoveStopInput,
): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/stops/${stopId}/position`, {
    method: "PUT",
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
  category?: StopCategory;
  payer: string;
  participants: string[];
}

export function addExpense(tripId: string, input: AddExpenseInput): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/expenses`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateExpense(
  tripId: string,
  expenseId: string,
  input: AddExpenseInput,
): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${tripId}/expenses/${expenseId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type InviteAccessScope = "anyone" | "restricted_emails";
export type InviteMemberRole = "editor" | "viewer";

export interface CreateInviteInput {
  accessScope: InviteAccessScope;
  allowedEmails: string[];
  role: InviteMemberRole;
  canInvite: boolean;
  /** ISO 8601 expiry, or null for a link that never expires. */
  expiresAt: string | null;
}

export interface CreatedInvite {
  url: string;
  token: string;
  expiresAt: string | null;
}

export type InvitePreviewStatus =
  | "usable"
  | "expired"
  | "revoked"
  | "email_restricted";

export interface InvitePreview {
  tripId: string;
  tripTitle: string;
  inviterName: string;
  memberCount: number;
  role: InviteMemberRole;
  accessScope: InviteAccessScope;
  status: InvitePreviewStatus;
  alreadyMember: boolean;
  expiresAt: string | null;
}

export interface AcceptedInvite {
  tripId: string;
  joined: boolean;
}

export function createTripInvite(
  tripId: string,
  input: CreateInviteInput,
): Promise<CreatedInvite> {
  return apiFetch<CreatedInvite>(`/api/trips/${tripId}/invites`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Issue a fresh invite link with the same settings and expire the current one.
 * `previousToken` is the token of the link being replaced.
 */
export function regenerateTripInvite(
  tripId: string,
  previousToken: string,
  input: CreateInviteInput,
): Promise<CreatedInvite> {
  return apiFetch<CreatedInvite>(`/api/trips/${tripId}/invites`, {
    method: "POST",
    body: JSON.stringify({ ...input, previousToken }),
  });
}

export function previewTripInvite(token: string): Promise<InvitePreview> {
  return apiFetch<InvitePreview>(
    `/api/trip-invites/${encodeURIComponent(token)}`,
  );
}

export function acceptTripInvite(token: string): Promise<AcceptedInvite> {
  return apiFetch<AcceptedInvite>(
    `/api/trip-invites/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );
}
