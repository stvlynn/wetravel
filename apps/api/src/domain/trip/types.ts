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

/** Collaboration role of a trip member. Owners always have full control. */
export type MemberRole = "owner" | "editor" | "viewer";

export interface MemberSnapshot {
  id: string;
  name: string;
  shortName: string;
  initials: string;
  avatarBg: string;
  avatarFg: string;
  /** Member avatar image URL. When absent the UI falls back to a colored circle. */
  image?: string | null;
  /** Better Auth user id backing this membership. Null for legacy/demo members. */
  userId?: string | null;
  /** Collaboration role controlling what the member may mutate. */
  role: MemberRole;
  /** Whether this member may create further invitations. */
  canInvite: boolean;
  isCurrentUser: boolean;
}

export interface DaySnapshot {
  number: number;
  /** ISO `YYYY-MM-DD` date for this itinerary day, or "" when unknown. */
  date: string;
  /** Legacy display label kept for imported/seeded data that has no ISO date. */
  dateLabel: string;
  city: string;
  color: string;
}

/**
 * Sentinel `CommentSnapshot.author` for agent replies posted into a stop
 * comment thread (when a member @mentions the agent there). Not a trip member
 * id — the UI resolves this to the agent avatar/name.
 */
export const AGENT_COMMENT_AUTHOR = "agent";

export interface CommentSnapshot {
  /** Trip member id, or {@link AGENT_COMMENT_AUTHOR} for agent replies. */
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
  /** Expense type, reusing the shared stop categories. Defaults to "Plan". */
  category: StopCategory;
  participants: string[];
  whenLabel: string;
  createdOrder: number;
}

export interface TripSnapshot {
  id: string;
  title: string;
  status: TripStatus;
  currency: string;
  /** Monotonic write counter bumped on every persisted mutation. Used to
   * detect stale agent suggestions before applying their patches. */
  version: number;
  /** Trip start date as an ISO `YYYY-MM-DD` string, or "" when unknown.
   * Day dates are derived from this by offsetting by (day.number - 1). */
  startDate: string;
  /** Inclusive end date as ISO `YYYY-MM-DD`, or "" when unknown. */
  endDate: string;
  ownerId: string;
  /** Optional Unsplash (or other) cover image URL for the trips list card. */
  coverUrl: string | null;
  /** Wizard answers captured at create time. Null when created without intake. */
  intake: TripIntake | null;
  /** When true, the planner should seed the first @agent message once. */
  agentSeedPending: boolean;
  members: MemberSnapshot[];
  days: DaySnapshot[];
  stops: StopSnapshot[];
  expenses: ExpenseSnapshot[];
}

/** Optional create-wizard answers persisted on the trip. Omitted fields mean TBD. */
export interface TripIntake {
  destination?: string;
  /** Geocoded destination center (set at create when destination is known). */
  destinationLat?: number;
  destinationLng?: number;
  dayCount?: number;
  startDate?: string;
  endDate?: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  partySize?: number;
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
