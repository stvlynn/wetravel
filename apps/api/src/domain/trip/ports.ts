import type { Trip } from "./trip";
import type { DaySnapshot, TripStatus } from "./types";

export interface TripSummaryMember {
  id: string;
  name: string;
  initials: string;
  avatarBg: string;
  avatarFg: string;
  image?: string | null;
  isCurrentUser: boolean;
}

export interface TripSummary {
  id: string;
  title: string;
  startLabel: string;
  endLabel: string;
  status: TripStatus;
  currency: string;
  coverColor: string;
  memberCount: number;
  stopCount: number;
  /** Creation time as an ISO 8601 string, for a relative "created … ago" label. */
  createdAt: string;
  /** Display name of the trip creator (owner, falling back to the first member). */
  creatorName: string;
  /** Members ordered with the creator first, for a stacked avatar cluster. */
  members: TripSummaryMember[];
}

/** Repository port for the Trip aggregate. Implemented in infrastructure. */
export interface TripRepository {
  findSummaries(): Promise<TripSummary[]>;
  findById(id: string): Promise<Trip | null>;
  /** Persist a brand-new trip (base row + members + days). */
  create(trip: Trip): Promise<void>;
  /** Update the trip's base row title. */
  rename(id: string, title: string): Promise<void>;
  /** Persist a newly appended itinerary day. */
  addDay(tripId: string, day: DaySnapshot): Promise<void>;
  save(trip: Trip): Promise<void>;
}
