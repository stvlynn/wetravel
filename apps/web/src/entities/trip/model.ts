import type { TripMember } from "@/entities/member";
import type { Stop } from "@/entities/stop";
import type { Budget, Expense } from "@/entities/expense";

export type TripStatus = "active" | "planning" | "settled";

export interface TripDay {
  number: number;
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
  memberCount: number;
  stopCount: number;
  /** Creation time as an ISO 8601 string. */
  createdAt: string;
  /** Display name of the trip creator. */
  creatorName: string;
  /** Members ordered with the creator first, for a stacked avatar cluster. */
  members: TripSummaryMember[];
}

export interface Trip {
  id: string;
  title: string;
  status: TripStatus;
  currency: string;
  /** ISO `YYYY-MM-DD` start date, or "" when unknown. Day calendar dates are
   * derived from this by offsetting each day by (number - 1). */
  startDate: string;
  members: TripMember[];
  days: TripDay[];
  stops: Stop[];
  expenses: Expense[];
  budget: Budget;
}
