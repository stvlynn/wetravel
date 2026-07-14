export type TripStatus = "active" | "planning" | "settled";

export interface TripSummaryMember {
  id: string;
  name: string;
  initials: string;
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
  coverUrl: string | null;
  memberCount: number;
  stopCount: number;
  createdAt: string;
  creatorName: string;
  members: TripSummaryMember[];
  location: { lat: number; lng: number } | null;
}

export interface TripMember extends TripSummaryMember {
  shortName: string;
  role: "owner" | "editor" | "viewer";
  canInvite: boolean;
  userId?: string | null;
}

export interface TripDay {
  number: number;
  date: string;
  dateLabel: string;
  city: string;
  color: string;
}

export interface TripStop {
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
  votes: string[];
}

export interface Trip {
  id: string;
  title: string;
  status: TripStatus;
  currency: string;
  startDate: string;
  coverUrl: string | null;
  members: TripMember[];
  permissions: {
    isMember: boolean;
    canEdit: boolean;
    canInvite: boolean;
  };
  days: TripDay[];
  stops: TripStop[];
}
