import { z } from "zod";

/** Shared trip mutation Zod schemas for HTTP routes and agent tools. */

export const stopCategorySchema = z.enum([
  "Sight",
  "Food",
  "Stay",
  "Shopping",
  "Activity",
  "Walk",
  "Park",
  "Transit",
  "Plan",
]);

export const hexColorSchema = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/);

export const dayNumberSchema = z.number().int().positive();

/** HTTP path param day (coerced string → number). */
export const dayNumberParamSchema = z.coerce.number().int().positive();

export const renameTripSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const addDayToolSchema = z.object({
  /** Optional ack field so models have a non-empty object shape. */
  confirm: z.literal(true).optional(),
});

export const deleteDayToolSchema = z.object({
  dayNumber: dayNumberSchema,
});

export const updateDaySchema = z
  .object({
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .or(z.literal(""))
      .optional(),
    dateLabel: z.string().trim().max(40).optional(),
    city: z.string().trim().max(80).optional(),
    color: hexColorSchema.optional(),
  })
  .refine(
    (value) =>
      value.date !== undefined ||
      value.dateLabel !== undefined ||
      value.city !== undefined ||
      value.color !== undefined,
    { message: "At least one day field is required" },
  );

/** Agent tool args for updateDay (includes dayNumber). */
export const updateDayToolSchema = z.object({
  dayNumber: dayNumberSchema,
  changes: updateDaySchema,
});

export const reorderDaysSchema = z.object({
  order: z.array(z.number().int().positive()).min(1),
});

export const insertStopSchema = z.object({
  day: z.number().int().positive(),
  index: z.number().int().min(0),
  name: z.string().min(1),
  time: z.string(),
  duration: z.string().trim().max(20).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  area: z.string().max(120).optional(),
  category: stopCategorySchema.optional(),
  cost: z.number().min(0).max(100_000_000).optional(),
  costCurrency: z.string().trim().min(1).max(8).optional(),
  note: z.string().max(20_000).optional(),
});

/** HTTP body for move (stopId is a path param). */
export const moveStopBodySchema = z.object({
  day: z.number().int().positive(),
  index: z.number().int().min(0),
});

/** Agent tool args for moveStop (includes stopId). */
export const moveStopToolSchema = z.object({
  stopId: z.string().min(1),
  day: z.number().int().positive(),
  index: z.number().int().min(0),
});

export const updateStopChangesSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    time: z.string().trim().max(20),
    duration: z.string().trim().max(20),
    area: z.string().trim().max(120),
    category: stopCategorySchema,
    cost: z.number().min(0).max(100_000_000),
    costCurrency: z.string().trim().min(1).max(8),
    note: z.string().max(20_000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one stop field is required",
  });

/** Agent tool args for updateStop. */
export const updateStopToolSchema = z.object({
  stopId: z.string().min(1),
  changes: updateStopChangesSchema,
});

export const expenseDraftSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().trim().min(1).max(8).optional(),
  category: stopCategorySchema.optional(),
  payer: z.string().min(1),
  participants: z.array(z.string().min(1)).min(1),
});

export const updateExpenseToolSchema = z.object({
  expenseId: z.string().min(1),
  changes: expenseDraftSchema,
});

// --- PendingPatch branch schemas (storage / proactive generateObject) ---

export const renameTripPatchSchema = z.object({
  kind: z.literal("rename_trip"),
  title: z.string().trim().min(1).max(120),
});

export const addDayPatchSchema = z.object({
  kind: z.literal("add_day"),
});

export const deleteDayPatchSchema = z.object({
  kind: z.literal("delete_day"),
  dayNumber: dayNumberSchema,
});

export const updateDayPatchSchema = z.object({
  kind: z.literal("update_day"),
  dayNumber: dayNumberSchema,
  changes: updateDaySchema,
});

export const reorderDaysPatchSchema = z.object({
  kind: z.literal("reorder_days"),
  order: z.array(z.number().int().positive()).min(1),
});

export const insertStopPatchSchema = z.object({
  kind: z.literal("insert_stop"),
  draft: insertStopSchema,
});

export const updateStopPatchSchema = z.object({
  kind: z.literal("update_stop"),
  stopId: z.string().min(1),
  changes: updateStopChangesSchema,
});

export const moveStopPatchSchema = z.object({
  kind: z.literal("move_stop"),
  move: z.object({
    stopId: z.string().min(1),
    day: z.number().int().positive(),
    index: z.number().int().min(0),
  }),
});

export const addExpensePatchSchema = z.object({
  kind: z.literal("add_expense"),
  draft: expenseDraftSchema,
});

export const updateExpensePatchSchema = z.object({
  kind: z.literal("update_expense"),
  expenseId: z.string().min(1),
  changes: expenseDraftSchema,
});

/** Discriminated union for proactive intervention + runtime validation. */
export const pendingPatchSchema = z.discriminatedUnion("kind", [
  renameTripPatchSchema,
  addDayPatchSchema,
  deleteDayPatchSchema,
  updateDayPatchSchema,
  reorderDaysPatchSchema,
  insertStopPatchSchema,
  updateStopPatchSchema,
  moveStopPatchSchema,
  addExpensePatchSchema,
  updateExpensePatchSchema,
]);

export type PendingPatchParsed = z.infer<typeof pendingPatchSchema>;
