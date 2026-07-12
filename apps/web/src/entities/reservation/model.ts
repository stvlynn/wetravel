export type ReservationType =
  | "flight"
  | "accommodation"
  | "restaurant"
  | "rail"
  | "ground_transport"
  | "activity"
  | "other";

export type ReservationStatus =
  | "tentative"
  | "confirmed"
  | "cancelled"
  | "completed";

export interface Reservation {
  id: string;
  tripId: string;
  type: ReservationType;
  status: ReservationStatus;
  title: string;
  provider: string;
  confirmationNumber: string;
  startAt: string;
  endAt: string | null;
  timezone: string;
  locationName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  dayNumber: number | null;
  stopId: string | null;
  expenseId: string | null;
  amountMinor: number | null;
  currency: string | null;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface ReservationDraft {
  type: ReservationType;
  status?: ReservationStatus;
  title: string;
  provider?: string;
  confirmationNumber?: string;
  startAt: string;
  endAt?: string | null;
  timezone: string;
  locationName?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  dayNumber?: number | null;
  stopId?: string | null;
  expenseId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  notes?: string;
}

