import type { z } from "zod";
import type { PendingPatch } from "../../../domain/agent";
import type { Trip, TripRepository } from "../../../domain/trip";
import {
  addDayPatchSchema,
  addDayToolSchema,
  addExpensePatchSchema,
  deleteDayPatchSchema,
  deleteDayToolSchema,
  expenseDraftSchema,
  insertStopPatchSchema,
  insertStopSchema,
  moveStopPatchSchema,
  moveStopToolSchema,
  renameTripPatchSchema,
  renameTripSchema,
  reorderDaysPatchSchema,
  reorderDaysSchema,
  updateDayPatchSchema,
  updateDayToolSchema,
  updateExpensePatchSchema,
  updateExpenseToolSchema,
  updateStopPatchSchema,
  updateStopToolSchema,
} from "./schemas";

/** Dependencies needed to run a trip op against the aggregate + repository. */
export interface TripOpContext {
  trip: Trip;
  actorUserId: string;
  tripRepo: TripRepository;
}

/**
 * One trip-scoped editor mutation. Single source for:
 * - AI SDK tool name / description / inputSchema
 * - PendingPatch mapping
 * - domain + persistence apply
 */
export interface TripOpDefinition<
  K extends PendingPatch["kind"],
  TInput extends z.ZodType,
> {
  kind: K;
  toolName: string;
  description: string;
  needsApproval: boolean;
  allowProactive: boolean;
  inputSchema: TInput;
  /** Full patch branch schema for generateObject / validation. */
  patchSchema: z.ZodType<Extract<PendingPatch, { kind: K }>>;
  toPatch: (input: z.infer<TInput>) => Extract<PendingPatch, { kind: K }>;
  apply: (
    ctx: TripOpContext,
    patch: Extract<PendingPatch, { kind: K }>,
  ) => Promise<string>;
}

function def<K extends PendingPatch["kind"], TInput extends z.ZodType>(
  op: TripOpDefinition<K, TInput>,
): TripOpDefinition<K, TInput> {
  return op;
}

/**
 * Registry of trip-scoped editor operations.
 * Adding a new user CRUD op: append one entry here (plus domain method if new).
 */
export const TRIP_OPS = [
  def({
    kind: "rename_trip",
    toolName: "renameTrip",
    description: "Rename the trip title. Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: renameTripSchema,
    patchSchema: renameTripPatchSchema,
    toPatch: (input) => ({ kind: "rename_trip", title: input.title }),
    apply: async ({ trip, tripRepo }, patch) => {
      trip.rename(patch.title);
      await tripRepo.rename(trip.id, trip.toSnapshot().title);
      return `Renamed trip to "${trip.toSnapshot().title}"`;
    },
  }),
  def({
    kind: "add_day",
    toolName: "addDay",
    description:
      "Append a new empty itinerary day at the end of the trip. Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: addDayToolSchema,
    patchSchema: addDayPatchSchema,
    toPatch: () => ({ kind: "add_day" }),
    apply: async ({ trip, tripRepo }) => {
      const day = trip.addDay();
      await tripRepo.addDay(trip.id, day);
      return `Added day ${day.number}`;
    },
  }),
  def({
    kind: "delete_day",
    toolName: "deleteDay",
    description:
      "Delete an itinerary day and its stops; remaining days renumber. Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: deleteDayToolSchema,
    patchSchema: deleteDayPatchSchema,
    toPatch: (input) => ({ kind: "delete_day", dayNumber: input.dayNumber }),
    apply: async ({ trip, tripRepo }, patch) => {
      trip.deleteDay(patch.dayNumber);
      await tripRepo.deleteDay(trip);
      return `Deleted day ${patch.dayNumber}`;
    },
  }),
  def({
    kind: "update_day",
    toolName: "updateDay",
    description:
      "Update a day's date, city, label, or color. Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: updateDayToolSchema,
    patchSchema: updateDayPatchSchema,
    toPatch: (input) => ({
      kind: "update_day",
      dayNumber: input.dayNumber,
      changes: input.changes,
    }),
    apply: async ({ trip, tripRepo }, patch) => {
      const day = trip.updateDay(patch.dayNumber, patch.changes);
      await tripRepo.updateDay(trip.id, day);
      return `Updated day ${day.number}${day.city ? ` (${day.city})` : ""}`;
    },
  }),
  def({
    kind: "reorder_days",
    toolName: "reorderDays",
    description:
      "Reorder itinerary days. `order` is a permutation of existing day numbers. Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: reorderDaysSchema,
    patchSchema: reorderDaysPatchSchema,
    toPatch: (input) => ({ kind: "reorder_days", order: input.order }),
    apply: async ({ trip, tripRepo }, patch) => {
      trip.reorderDays(patch.order);
      await tripRepo.reorderDays(trip);
      return `Reordered days: ${patch.order.join(" → ")}`;
    },
  }),
  def({
    kind: "insert_stop",
    toolName: "insertStop",
    description:
      "Add a new stop to a day at a position (create). Use when the member wants a new place/activity, not an edit of an existing stop. Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: insertStopSchema,
    patchSchema: insertStopPatchSchema,
    toPatch: (input) => ({ kind: "insert_stop", draft: input }),
    apply: async ({ trip, tripRepo, actorUserId }, patch) => {
      const stop = trip.insertStop(patch.draft, trip.actingMemberId(actorUserId));
      await tripRepo.save(trip);
      return `Inserted stop "${stop.name}" (${stop.id}) on day ${stop.day}`;
    },
  }),
  def({
    kind: "update_stop",
    toolName: "updateStop",
    description:
      "Update fields on an existing itinerary stop (name, time, duration, area, category, cost, note). Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: updateStopToolSchema,
    patchSchema: updateStopPatchSchema,
    toPatch: (input) => ({
      kind: "update_stop",
      stopId: input.stopId,
      changes: input.changes,
    }),
    apply: async ({ trip, tripRepo }, patch) => {
      const stop = trip.updateStop(patch.stopId, patch.changes);
      await tripRepo.save(trip);
      return `Updated stop "${stop.name}" (${stop.id})`;
    },
  }),
  def({
    kind: "move_stop",
    toolName: "moveStop",
    description:
      "Move a stop to another day and position in that day's list. Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: moveStopToolSchema,
    patchSchema: moveStopPatchSchema,
    toPatch: (input) => ({
      kind: "move_stop",
      move: { stopId: input.stopId, day: input.day, index: input.index },
    }),
    apply: async ({ trip, tripRepo }, patch) => {
      const stop = trip.moveStop(patch.move);
      await tripRepo.save(trip);
      return `Moved stop "${stop.name}" to day ${stop.day} index ${patch.move.index}`;
    },
  }),
  def({
    kind: "add_expense",
    toolName: "addExpense",
    description:
      "Add a new shared expense (create). payer and participants must be member ids from the snapshot. Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: expenseDraftSchema,
    patchSchema: addExpensePatchSchema,
    toPatch: (input) => ({ kind: "add_expense", draft: input }),
    apply: async ({ trip, tripRepo }, patch) => {
      const expense = trip.addExpense(patch.draft);
      await tripRepo.save(trip);
      return `Added expense "${expense.description}" (${expense.id})`;
    },
  }),
  def({
    kind: "update_expense",
    toolName: "updateExpense",
    description:
      "Replace editable fields on an existing expense. Requires member approval.",
    needsApproval: true,
    allowProactive: true,
    inputSchema: updateExpenseToolSchema,
    patchSchema: updateExpensePatchSchema,
    toPatch: (input) => ({
      kind: "update_expense",
      expenseId: input.expenseId,
      changes: input.changes,
    }),
    apply: async ({ trip, tripRepo }, patch) => {
      const expense = trip.updateExpense(patch.expenseId, patch.changes);
      await tripRepo.save(trip);
      return `Updated expense "${expense.description}" (${expense.id})`;
    },
  }),
] as const;

export type TripOp = (typeof TRIP_OPS)[number];

export function listTripOps(): readonly TripOp[] {
  return TRIP_OPS;
}

/** Ops exposed as AI SDK write tools (approval-gated). */
export function listWriteOps(): readonly TripOp[] {
  return TRIP_OPS.filter((o) => o.needsApproval);
}

export function listProactiveOps(): readonly TripOp[] {
  return TRIP_OPS.filter((o) => o.allowProactive);
}

export function getTripOp(kind: PendingPatch["kind"]): TripOp | undefined {
  return TRIP_OPS.find((o) => o.kind === kind);
}

export function writeToolNames(): string[] {
  return listWriteOps().map((o) => o.toolName);
}
