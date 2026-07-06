import { DomainError } from "../shared/errors";
import { computeBudget } from "./settlement";
import type {
  Budget,
  DaySnapshot,
  ExpenseSnapshot,
  StopCategory,
  StopSnapshot,
  TripSnapshot,
} from "./types";

export interface InsertStopDraft {
  day: number;
  /** Zero-based position within the day's stops. */
  index: number;
  name: string;
  time: string;
  /** Real coordinates from geocoding or a map pick. When absent, the stop's
   * position is interpolated from its neighbours. */
  lat?: number;
  lng?: number;
  /** Optional area/context label from geocoding. */
  area?: string;
  /** Optional activity type. Defaults to "Plan" when omitted. */
  category?: StopCategory;
  /** Optional estimated cost per person, in the trip's minor currency units. */
  cost?: number;
  /** Optional ISO currency code for `cost`. Defaults to the trip currency. */
  costCurrency?: string;
  /** Optional free-form note (Markdown, may embed image URLs). */
  note?: string;
}

export interface AddExpenseDraft {
  description: string;
  amount: number;
  /** ISO currency code for the amount. Defaults to the trip currency. */
  currency?: string;
  payer: string;
  participants: string[];
}

export interface CreateTripDraft {
  title: string;
  currency?: string;
}

export interface TripOwner {
  id: string;
  name: string;
  image?: string | null;
}

/** Avatar palette for auto-created members, cycling by a stable index. */
const MEMBER_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "#dde7fb", fg: "#2b4d93" },
  { bg: "#dde2ee", fg: "#3c4760" },
  { bg: "#d9efe6", fg: "#1f6b4d" },
  { bg: "#f3e8d3", fg: "#7a5a1e" },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function shortNameOf(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean)[0] ?? name.trim();
}

/** Palette for itinerary days, cycled by day number. */
const DAY_COLORS = [
  "#3f6fc9",
  "#305bb0",
  "#28304a",
  "#3c8f6f",
  "#6d788f",
  "#8a5cc0",
  "#c06a3c",
];

function dayColorFor(number: number): string {
  return DAY_COLORS[(number - 1) % DAY_COLORS.length]!;
}

/** Today's date as an ISO `YYYY-MM-DD` string (server local time). */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY_CENTERS: Record<number, [number, number]> = {
  1: [35.68, 139.75],
  2: [35.68, 139.72],
  3: [35.0, 135.77],
  4: [35.01, 135.75],
  5: [34.69, 135.5],
};

/** Trip aggregate root. All itinerary/expense mutations go through here so
 * invariants hold. Reconstitute with `fromSnapshot`, persist `toSnapshot`. */
export class Trip {
  private constructor(private snapshot: TripSnapshot) {}

  static fromSnapshot(snapshot: TripSnapshot): Trip {
    return new Trip({
      ...snapshot,
      stops: [...snapshot.stops].sort((a, b) => a.order - b.order),
      expenses: [...snapshot.expenses].sort(
        (a, b) => a.createdOrder - b.createdOrder,
      ),
    });
  }

  /** Create a fresh trip owned by the given user, who becomes its first member.
   * Starts with a single empty day and no stops/expenses. */
  static create(draft: CreateTripDraft, owner: TripOwner): Trip {
    const title = draft.title.trim();
    if (!title) throw new DomainError("empty_trip_title", "Trip title is required");

    const palette = MEMBER_PALETTE[0]!;
    const snapshot: TripSnapshot = {
      id: `t${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      status: "planning",
      currency: draft.currency?.trim() || "JPY",
      startDate: todayIso(),
      ownerId: owner.id,
      members: [
        {
          id: owner.id,
          name: owner.name,
          shortName: shortNameOf(owner.name),
          initials: initialsOf(owner.name),
          avatarBg: palette.bg,
          avatarFg: palette.fg,
          image: owner.image ?? null,
          isCurrentUser: true,
        },
      ],
      days: [{ number: 1, dateLabel: "", city: "", color: dayColorFor(1) }],
      stops: [],
      expenses: [],
    };
    return new Trip(snapshot);
  }

  get id(): string {
    return this.snapshot.id;
  }

  toSnapshot(): TripSnapshot {
    return this.snapshot;
  }

  budget(): Budget {
    return computeBudget(this.snapshot.members, this.snapshot.expenses);
  }

  private requireStop(stopId: string): StopSnapshot {
    const stop = this.snapshot.stops.find((s) => s.id === stopId);
    if (!stop) throw new DomainError("stop_not_found", `Stop ${stopId} not found`);
    return stop;
  }

  private requireMember(memberId: string): void {
    if (!this.snapshot.members.some((m) => m.id === memberId)) {
      throw new DomainError("member_not_found", `Member ${memberId} not found`);
    }
  }

  /** Add the member to the stop's votes if absent, else remove. Idempotent. */
  toggleVote(stopId: string, memberId: string): void {
    this.requireMember(memberId);
    const stop = this.requireStop(stopId);
    stop.votes = stop.votes.includes(memberId)
      ? stop.votes.filter((v) => v !== memberId)
      : [...stop.votes, memberId];
  }

  /** Append a non-empty comment authored by the member. */
  addComment(stopId: string, memberId: string, text: string): void {
    this.requireMember(memberId);
    const trimmed = text.trim();
    if (!trimmed) throw new DomainError("empty_comment", "Comment text is required");
    const stop = this.requireStop(stopId);
    stop.comments = [
      ...stop.comments,
      { author: memberId, timeLabel: "Just now", text: trimmed },
    ];
  }

  /** Insert a stop at a position within a day, interpolating coordinates. */
  insertStop(draft: InsertStopDraft, createdBy: string): StopSnapshot {
    this.requireMember(createdBy);
    const name = draft.name.trim();
    if (!name) throw new DomainError("empty_stop_name", "Stop name is required");

    const dayStops = this.snapshot.stops.filter((s) => s.day === draft.day);
    const index = Math.max(0, Math.min(draft.index, dayStops.length));
    const prev = dayStops[index - 1];
    const next = dayStops[index];
    const center = DAY_CENTERS[draft.day] ?? [35.68, 139.75];

    const hasCoords =
      typeof draft.lat === "number" &&
      typeof draft.lng === "number" &&
      Number.isFinite(draft.lat) &&
      Number.isFinite(draft.lng);

    const lat = hasCoords
      ? draft.lat!
      : prev && next
        ? (prev.lat + next.lat) / 2
        : prev
          ? prev.lat + 0.004
          : next
            ? next.lat - 0.004
            : center[0];
    const lng = hasCoords
      ? draft.lng!
      : prev && next
        ? (prev.lng + next.lng) / 2
        : prev
          ? prev.lng + 0.004
          : next
            ? next.lng - 0.004
            : center[1];

    const cost =
      typeof draft.cost === "number" && Number.isFinite(draft.cost) && draft.cost > 0
        ? Math.round(draft.cost)
        : 0;
    // Only record a currency when there is a cost; otherwise fall back to the
    // trip currency at read time.
    const costCurrency =
      cost > 0 ? draft.costCurrency?.trim() || this.snapshot.currency : "";

    const stop: StopSnapshot = {
      id: `n${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      day: draft.day,
      time: draft.time.trim() || "—",
      duration: "1h",
      name,
      area: draft.area?.trim() || "TBD",
      category: draft.category ?? "Plan",
      lat,
      lng,
      cost,
      costCurrency,
      createdBy,
      transit: false,
      order: 0,
      note: draft.note?.trim() ?? "",
      votes: [],
      comments: [],
    };

    // Splice into the global ordering respecting the day position.
    const all = this.snapshot.stops;
    let pos: number;
    if (next) pos = all.indexOf(next);
    else if (prev) pos = all.indexOf(prev) + 1;
    else pos = all.length;
    all.splice(pos, 0, stop);
    all.forEach((s, i) => (s.order = i));

    return stop;
  }

  /** Add an equally-split expense. */
  addExpense(draft: AddExpenseDraft): ExpenseSnapshot {
    const description = draft.description.trim();
    if (!description) throw new DomainError("empty_expense", "Description is required");
    if (!(draft.amount > 0)) throw new DomainError("invalid_amount", "Amount must be positive");
    if (draft.participants.length === 0) {
      throw new DomainError("no_participants", "At least one participant is required");
    }
    this.requireMember(draft.payer);
    for (const p of draft.participants) this.requireMember(p);

    const expense: ExpenseSnapshot = {
      id: `e${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      description,
      payer: draft.payer,
      amount: Math.round(draft.amount),
      currency: draft.currency?.trim() || this.snapshot.currency,
      participants: [...draft.participants],
      whenLabel: "Just added",
      createdOrder: this.snapshot.expenses.length,
    };
    this.snapshot.expenses.push(expense);
    return expense;
  }

  /** Rename the trip. Title is trimmed and must be non-empty. */
  rename(title: string): void {
    const trimmed = title.trim();
    if (!trimmed) throw new DomainError("empty_trip_title", "Trip title is required");
    this.snapshot.title = trimmed;
  }

  /** Append a new empty day at the end of the itinerary and return it. Its
   * calendar date is derived from the trip's start date on the read side. */
  addDay(): DaySnapshot {
    const nextNumber =
      this.snapshot.days.reduce((max, d) => Math.max(max, d.number), 0) + 1;
    const day: DaySnapshot = {
      number: nextNumber,
      dateLabel: "",
      city: "",
      color: dayColorFor(nextNumber),
    };
    this.snapshot.days.push(day);
    return day;
  }

  /** The member flagged as the current user (demo mapping). */
  currentMemberId(): string {
    const me = this.snapshot.members.find((m) => m.isCurrentUser);
    return me?.id ?? this.snapshot.members[0]?.id ?? "";
  }
}
