import { DomainError } from "../shared/errors";
import { computeBudget } from "./settlement";
import type {
  Budget,
  DaySnapshot,
  ExpenseSnapshot,
  MemberRole,
  MemberSnapshot,
  StopCategory,
  StopSnapshot,
  TripSnapshot,
} from "./types";

/** Effective permissions a user has against a trip. */
export interface TripPermissions {
  isMember: boolean;
  canEdit: boolean;
  canInvite: boolean;
}

export interface InsertStopDraft {
  day: number;
  /** Zero-based position within the day's stops. */
  index: number;
  name: string;
  time: string;
  /** Optional planned duration (e.g. "1h"). Defaults to "1h" when omitted. */
  duration?: string;
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

export interface MoveStopDraft {
  stopId: string;
  day: number;
  /** Zero-based position within the target day's stops after removing the stop. */
  index: number;
}

/** Partial edit of an existing stop's display metadata. Only provided fields
 * are applied; positional day changes go through `moveStop`. */
export interface UpdateStopDraft {
  name?: string;
  time?: string;
  duration?: string;
  area?: string;
  category?: StopCategory;
  /** Estimated cost per person; 0 clears the cost and its currency. */
  cost?: number;
  /** ISO currency code for `cost`. Ignored when the effective cost is 0. */
  costCurrency?: string;
  /** Free-form note (Markdown, may embed image URLs). Empty string clears it. */
  note?: string;
}

export interface AddExpenseDraft {
  description: string;
  amount: number;
  /** ISO currency code for the amount. Defaults to the trip currency. */
  currency?: string;
  /** Optional expense type. Defaults to "Plan" when omitted. */
  category?: StopCategory;
  payer: string;
  participants: string[];
}

export interface UpdateDayDraft {
  /** Optional ISO date override for the day header. */
  date?: string;
  /** Legacy display date override for imported data without an ISO date. */
  dateLabel?: string;
  /** Optional city or route label for the day header. */
  city?: string;
  /** Optional hex theme color (e.g. `#3f6fc9`) for the day header. */
  color?: string;
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

/** Validate and normalize a user-supplied day color. Returns null for invalid
 * or missing values. */
function normalizeDayColor(color: string | undefined): string | null {
  if (color == null) return null;
  const trimmed = color.trim();
  if (!HEX_COLOR.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/** Today's date as an ISO `YYYY-MM-DD` string (server local time). */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function addDaysIso(date: string, days: number): string {
  if (!ISO_DATE.test(date)) return "";
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
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
    const startDate = todayIso();
    const snapshot: TripSnapshot = {
      id: `t${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      status: "planning",
      currency: draft.currency?.trim() || "JPY",
      startDate,
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
          userId: owner.id,
          role: "owner",
          canInvite: true,
          isCurrentUser: true,
        },
      ],
      days: [
        {
          number: 1,
          date: startDate,
          dateLabel: "",
          city: "",
          color: dayColorFor(1),
        },
      ],
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

  private requireDay(number: number): DaySnapshot {
    const day = this.snapshot.days.find((d) => d.number === number);
    if (!day) throw new DomainError("day_not_found", `Day ${number} not found`);
    return day;
  }

  private requireMember(memberId: string): void {
    if (!this.snapshot.members.some((m) => m.id === memberId)) {
      throw new DomainError("member_not_found", `Member ${memberId} not found`);
    }
  }

  private requireExpense(expenseId: string): ExpenseSnapshot {
    const expense = this.snapshot.expenses.find((e) => e.id === expenseId);
    if (!expense) {
      throw new DomainError("expense_not_found", `Expense ${expenseId} not found`);
    }
    return expense;
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
      duration: draft.duration?.trim() || "1h",
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

  /** Edit an existing stop's display metadata. Applies only the provided
   * fields, normalizing them the same way `insertStop` does. */
  updateStop(stopId: string, draft: UpdateStopDraft): StopSnapshot {
    const stop = this.requireStop(stopId);

    if (draft.name !== undefined) {
      const name = draft.name.trim();
      if (!name) throw new DomainError("empty_stop_name", "Stop name is required");
      stop.name = name;
    }
    if (draft.time !== undefined) stop.time = draft.time.trim() || "—";
    if (draft.duration !== undefined) stop.duration = draft.duration.trim() || "1h";
    if (draft.area !== undefined) stop.area = draft.area.trim() || "TBD";
    if (draft.category !== undefined) stop.category = draft.category;

    if (draft.cost !== undefined) {
      const cost =
        Number.isFinite(draft.cost) && draft.cost > 0 ? Math.round(draft.cost) : 0;
      stop.cost = cost;
      // A currency is only meaningful alongside a positive cost.
      stop.costCurrency =
        cost > 0
          ? draft.costCurrency?.trim() || stop.costCurrency || this.snapshot.currency
          : "";
    } else if (draft.costCurrency !== undefined && stop.cost > 0) {
      stop.costCurrency = draft.costCurrency.trim() || this.snapshot.currency;
    }

    if (draft.note !== undefined) stop.note = draft.note.trim();

    return stop;
  }

  /** Move an existing stop to a position within any itinerary day. */
  moveStop(draft: MoveStopDraft): StopSnapshot {
    this.requireDay(draft.day);
    const stop = this.requireStop(draft.stopId);
    const rest = this.snapshot.stops.filter((s) => s.id !== stop.id);
    const targetDayStops = rest.filter((s) => s.day === draft.day);
    const index = Math.max(0, Math.min(draft.index, targetDayStops.length));
    const prev = targetDayStops[index - 1];
    const next = targetDayStops[index];

    stop.day = draft.day;

    let pos: number;
    if (next) {
      pos = rest.indexOf(next);
    } else if (prev) {
      pos = rest.indexOf(prev) + 1;
    } else {
      const firstLaterDayStop = rest.find((s) => s.day > draft.day);
      pos = firstLaterDayStop ? rest.indexOf(firstLaterDayStop) : rest.length;
    }

    rest.splice(pos, 0, stop);
    rest.forEach((s, i) => (s.order = i));
    this.snapshot.stops = rest;
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
      category: draft.category ?? "Plan",
      participants: [...draft.participants],
      whenLabel: "Just added",
      createdOrder: this.snapshot.expenses.length,
    };
    this.snapshot.expenses.push(expense);
    return expense;
  }

  /** Replace an existing expense's editable fields. Id, when label, and sort
   * order are preserved. */
  updateExpense(expenseId: string, draft: AddExpenseDraft): ExpenseSnapshot {
    const expense = this.requireExpense(expenseId);
    const description = draft.description.trim();
    if (!description) throw new DomainError("empty_expense", "Description is required");
    if (!(draft.amount > 0)) throw new DomainError("invalid_amount", "Amount must be positive");
    if (draft.participants.length === 0) {
      throw new DomainError("no_participants", "At least one participant is required");
    }
    this.requireMember(draft.payer);
    for (const p of draft.participants) this.requireMember(p);

    expense.description = description;
    expense.payer = draft.payer;
    expense.amount = Math.round(draft.amount);
    expense.currency = draft.currency?.trim() || this.snapshot.currency;
    expense.category = draft.category ?? "Plan";
    expense.participants = [...draft.participants];
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
      date: addDaysIso(this.snapshot.startDate, nextNumber - 1),
      dateLabel: "",
      city: "",
      color: dayColorFor(nextNumber),
    };
    this.snapshot.days.push(day);
    return day;
  }

  /** Update display metadata for an existing itinerary day. */
  updateDay(number: number, draft: UpdateDayDraft): DaySnapshot {
    const day = this.requireDay(number);
    if (draft.date !== undefined) day.date = draft.date.trim();
    if (draft.dateLabel !== undefined) day.dateLabel = draft.dateLabel.trim();
    if (draft.city !== undefined) day.city = draft.city.trim();
    if (draft.color !== undefined) {
      const normalized = normalizeDayColor(draft.color);
      if (!normalized) {
        throw new DomainError("invalid_day_color", "Day color must be a hex color like #3f6fc9");
      }
      day.color = normalized;
    }
    return day;
  }

  /** Delete an itinerary day and renumber the remaining days 1..N. Stops that
   * belonged to the deleted day are removed; stops on remaining days keep their
   * relative order and are remapped to the new day numbers. */
  deleteDay(number: number): void {
    this.requireDay(number);
    const remaining = this.snapshot.days
      .filter((d) => d.number !== number)
      .sort((a, b) => a.number - b.number);

    const oldToNew = new Map<number, number>();
    const renumbered: DaySnapshot[] = remaining.map((day, i) => {
      const newNumber = i + 1;
      oldToNew.set(day.number, newNumber);
      return {
        number: newNumber,
        date: addDaysIso(this.snapshot.startDate, newNumber - 1),
        dateLabel: day.dateLabel,
        city: day.city,
        color: day.color,
      };
    });

    this.snapshot.days = renumbered;
    this.snapshot.stops = this.snapshot.stops
      .filter((s) => oldToNew.has(s.day))
      .map((s) => ({ ...s, day: oldToNew.get(s.day)! }))
      .sort((a, b) => a.day - b.day || a.order - b.order)
      .map((s, i) => ({ ...s, order: i }));
  }

  /** Reorder the itinerary to the given sequence of existing day numbers.
   * Days are renumbered 1..N by their new position: each day keeps its city,
   * legacy label, and stops, while its calendar date and color are recomputed
   * from the new position (dates stay sequential from the trip start). Stops
   * are remapped to their day's new number, preserving per-day order. */
  reorderDays(order: number[]): void {
    const days = this.snapshot.days;
    const isPermutation =
      order.length === days.length &&
      new Set(order).size === order.length &&
      order.every((n) => days.some((d) => d.number === n));
    if (!isPermutation) {
      throw new DomainError(
        "invalid_day_order",
        "Order must be a permutation of the existing day numbers",
      );
    }

    const byNumber = new Map(days.map((d) => [d.number, d]));
    const oldToNew = new Map<number, number>();
    const reordered: DaySnapshot[] = order.map((oldNumber, i) => {
      const newNumber = i + 1;
      oldToNew.set(oldNumber, newNumber);
      const day = byNumber.get(oldNumber)!;
      return {
        number: newNumber,
        date: addDaysIso(this.snapshot.startDate, newNumber - 1),
        dateLabel: day.dateLabel,
        city: day.city,
        color: dayColorFor(newNumber),
      };
    });

    this.snapshot.days = reordered;
    this.snapshot.stops = this.snapshot.stops
      .map((s) => ({ ...s, day: oldToNew.get(s.day) ?? s.day }))
      .sort((a, b) => a.day - b.day || a.order - b.order)
      .map((s, i) => ({ ...s, order: i }));
  }

  /** The member flagged as the current user (demo mapping). */
  currentMemberId(): string {
    const me = this.snapshot.members.find((m) => m.isCurrentUser);
    return me?.id ?? this.snapshot.members[0]?.id ?? "";
  }

  /** Find the membership backing a Better Auth user, if any. */
  memberByUserId(userId: string): MemberSnapshot | undefined {
    return this.snapshot.members.find((m) => m.userId === userId);
  }

  /** True when no membership is backed by a real user (pure seed/demo trip).
   * Such trips stay openly accessible so the seeded demo keeps working. */
  private isLegacyDemo(): boolean {
    return !this.snapshot.members.some((m) => !!m.userId);
  }

  /** Resolve the effective permissions a user has against this trip. */
  permissionsFor(userId: string): TripPermissions {
    const member = this.memberByUserId(userId);
    if (member) {
      return {
        isMember: true,
        canEdit: member.role !== "viewer",
        canInvite: member.canInvite,
      };
    }
    if (this.isLegacyDemo()) {
      return { isMember: true, canEdit: true, canInvite: true };
    }
    return { isMember: false, canEdit: false, canInvite: false };
  }

  /** The trip-local member id that should author actions for this user.
   * Falls back to the legacy current-user member on seed/demo trips. */
  actingMemberId(userId: string): string {
    const member = this.memberByUserId(userId);
    if (member) return member.id;
    return this.currentMemberId();
  }

  /** Add a real user as a trip member. Throws if the user is already a member. */
  addMember(params: {
    userId: string;
    name: string;
    image?: string | null;
    role: MemberRole;
    canInvite: boolean;
  }): MemberSnapshot {
    if (this.memberByUserId(params.userId)) {
      throw new DomainError(
        "already_member",
        `User ${params.userId} is already a member`,
      );
    }
    const name = params.name.trim() || "Traveler";
    const palette =
      MEMBER_PALETTE[this.snapshot.members.length % MEMBER_PALETTE.length]!;
    const member: MemberSnapshot = {
      id: `m${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      shortName: shortNameOf(name),
      initials: initialsOf(name),
      avatarBg: palette.bg,
      avatarFg: palette.fg,
      image: params.image ?? null,
      userId: params.userId,
      role: params.role,
      canInvite: params.canInvite,
      isCurrentUser: false,
    };
    this.snapshot.members.push(member);
    return member;
  }
}
