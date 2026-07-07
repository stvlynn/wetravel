import type { Trip } from "./trip";
import type { DaySnapshot, MemberSnapshot, TripStatus } from "./types";

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
  /** Trips the user may see: ones they are a member of, plus legacy/demo trips
   * that have no real members yet. */
  findSummaries(userId: string): Promise<TripSummary[]>;
  findById(id: string): Promise<Trip | null>;
  /** Persist a brand-new trip (base row + members + days). */
  create(trip: Trip): Promise<void>;
  /** Append a single member row to an existing trip. */
  addMember(tripId: string, member: MemberSnapshot): Promise<void>;
  /** Update the trip's base row title. */
  rename(id: string, title: string): Promise<void>;
  /** Persist a newly appended itinerary day. */
  addDay(tripId: string, day: DaySnapshot): Promise<void>;
  /** Update display metadata for an existing itinerary day. */
  updateDay(tripId: string, day: DaySnapshot): Promise<void>;
  /** Rewrite all itinerary days and stops after a reorder, in one transaction. */
  reorderDays(trip: Trip): Promise<void>;
  /** Rewrite all itinerary days and stops after a day deletion, in one transaction. */
  deleteDay(trip: Trip): Promise<void>;
  save(trip: Trip): Promise<void>;
}
