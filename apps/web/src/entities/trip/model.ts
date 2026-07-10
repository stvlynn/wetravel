import type { TripMember } from "@/entities/member";
import type { Stop } from "@/entities/stop";
import type { Budget, Expense } from "@/entities/expense";

export type TripStatus = "active" | "planning" | "settled";

export interface TripDay {
  number: number;
  /** ISO `YYYY-MM-DD` date for this itinerary day, or "" when unknown. */
  date: string;
  /** Legacy display label kept for imported data that has no ISO date. */
  dateLabel: string;
  city: string;
  color: string;
}

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
  /** Optional cover image URL; null falls back to the decorative route SVG. */
  coverUrl: string | null;
  memberCount: number;
  stopCount: number;
  /** Creation time as an ISO 8601 string. */
  createdAt: string;
  /** Display name of the trip creator. */
  creatorName: string;
  /** Members ordered with the creator first, for a stacked avatar cluster. */
  members: TripSummaryMember[];
  /** Representative location derived from the first located stop. */
  location: { lat: number; lng: number } | null;
}

/** The requesting user's effective permissions on a trip. */
export interface TripPermissions {
  isMember: boolean;
  canEdit: boolean;
  canInvite: boolean;
}

/** Wizard answers captured at create time. Omitted fields mean TBD. */
export interface TripIntake {
  destination?: string;
  /** Geocoded destination center from create (when destination was set). */
  destinationLat?: number;
  destinationLng?: number;
  dayCount?: number;
  startDate?: string;
  endDate?: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  partySize?: number;
}

export interface Trip {
  id: string;
  title: string;
  status: TripStatus;
  currency: string;
  /** ISO `YYYY-MM-DD` start date, or "" when unknown. Day calendar dates are
   * derived from this by offsetting each day by (number - 1). */
  startDate: string;
  coverUrl: string | null;
  intake: TripIntake | null;
  agentSeedPending: boolean;
  members: TripMember[];
  permissions: TripPermissions;
  days: TripDay[];
  stops: Stop[];
  expenses: Expense[];
  budget: Budget;
}
