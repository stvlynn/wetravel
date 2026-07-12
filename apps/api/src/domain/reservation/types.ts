export const RESERVATION_TYPES = [
  "flight",
  "accommodation",
  "restaurant",
  "rail",
  "ground_transport",
  "activity",
  "other",
] as const;

export type ReservationType = (typeof RESERVATION_TYPES)[number];

export const RESERVATION_STATUSES = [
  "tentative",
  "confirmed",
  "cancelled",
  "completed",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export interface ReservationSnapshot {
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

export interface CreateReservationDraft {
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

export type UpdateReservationDraft = Partial<CreateReservationDraft>;

