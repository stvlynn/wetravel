export type TripStatus = "active" | "planning" | "settled";

export type StopCategory =
  | "Sight"
  | "Food"
  | "Stay"
  | "Shopping"
  | "Activity"
  | "Walk"
  | "Park"
  | "Transit"
  | "Plan";

export interface MemberSnapshot {
  id: string;
  name: string;
  shortName: string;
  initials: string;
  avatarBg: string;
  avatarFg: string;
  isCurrentUser: boolean;
}

export interface DaySnapshot {
  number: number;
  dateLabel: string;
  city: string;
  color: string;
}

export interface CommentSnapshot {
  author: string;
  timeLabel: string;
  text: string;
}

export interface StopSnapshot {
  id: string;
  day: number;
  time: string;
  duration: string;
  name: string;
  area: string;
  category: StopCategory;
  lat: number;
  lng: number;
  cost: number;
  /** ISO currency code for `cost`. Empty string means "use the trip currency".
   * Costs are display-only, so mixed currencies never enter the budget. */
  costCurrency: string;
  createdBy: string;
  transit: boolean;
  order: number;
  /** Free-form note in Markdown (may embed image URLs). Empty string if none. */
  note: string;
  votes: string[];
  comments: CommentSnapshot[];
}

export interface ExpenseSnapshot {
  id: string;
  description: string;
  payer: string;
  amount: number;
  /** ISO currency code for `amount`. Empty string means "use the trip currency". */
  currency: string;
  participants: string[];
  whenLabel: string;
  createdOrder: number;
}

export interface TripSnapshot {
  id: string;
  title: string;
  status: TripStatus;
  currency: string;
  /** Trip start date as an ISO `YYYY-MM-DD` string, or "" when unknown.
   * Day dates are derived from this by offsetting by (day.number - 1). */
  startDate: string;
  ownerId: string;
  members: MemberSnapshot[];
  days: DaySnapshot[];
  stops: StopSnapshot[];
  expenses: ExpenseSnapshot[];
}

export interface Balance {
  memberId: string;
  paid: number;
  share: number;
  net: number;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

export interface Budget {
  total: number;
  perPerson: number;
  balances: Balance[];
  settlements: Settlement[];
}
