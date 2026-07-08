import type { Trip, TripPermissions } from "../domain/trip";
import type { TripSnapshot } from "../domain/trip";

export interface TripDto {
  id: string;
  title: string;
  status: string;
  currency: string;
  /** ISO `YYYY-MM-DD` start date, or "" when unknown. */
  startDate: string;
  members: TripSnapshot["members"];
  /** The requesting user's effective permissions on this trip. */
  permissions: TripPermissions;
  days: TripSnapshot["days"];
  stops: Array<{
    id: string;
    day: number;
    time: string;
    duration: string;
    name: string;
    area: string;
    category: string;
    lat: number;
    lng: number;
    cost: number;
    costCurrency: string;
    createdBy: string;
    transit: boolean;
    note: string;
    votes: string[];
    comments: { author: string; timeLabel: string; text: string }[];
  }>;
  expenses: Array<{
    id: string;
    description: string;
    payer: string;
    amount: number;
    currency: string;
    category: string;
    participants: string[];
    whenLabel: string;
  }>;
  budget: ReturnType<Trip["budget"]>;
}

/** Serialize the aggregate to the client DTO, dropping persistence-only fields
 * (order, createdOrder) and attaching the computed budget. `currentUserId`
 * drives the per-request `isCurrentUser` flag and the returned permissions. */
export function toTripDto(trip: Trip, currentUserId: string): TripDto {
  const s = trip.toSnapshot();
  const members = s.members.map((m) => ({
    ...m,
    isCurrentUser: m.userId ? m.userId === currentUserId : m.isCurrentUser,
  }));
  return {
    id: s.id,
    title: s.title,
    status: s.status,
    currency: s.currency,
    startDate: s.startDate,
    members,
    permissions: trip.permissionsFor(currentUserId),
    days: s.days,
    stops: s.stops.map((st) => ({
      id: st.id,
      day: st.day,
      time: st.time,
      duration: st.duration,
      name: st.name,
      area: st.area,
      category: st.category,
      lat: st.lat,
      lng: st.lng,
      cost: st.cost,
      costCurrency: st.costCurrency,
      createdBy: st.createdBy,
      transit: st.transit,
      note: st.note,
      votes: st.votes,
      comments: st.comments,
    })),
    expenses: s.expenses.map((e) => ({
      id: e.id,
      description: e.description,
      payer: e.payer,
      amount: e.amount,
      currency: e.currency,
      category: e.category,
      participants: e.participants,
      whenLabel: e.whenLabel,
    })),
    budget: trip.budget(),
  };
}
