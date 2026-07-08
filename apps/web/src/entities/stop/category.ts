import type { StopCategory } from "./model";

/** SVG path + token-based colors per stop category, ported from the prototype
 * `catMeta`. Category names are stable data, not translated copy. */
export interface CategoryMeta {
  path: string;
  bg: string;
  fg: string;
}

const META: Record<StopCategory, CategoryMeta> = {
  Sight: { path: "M3 21h18 M5 21v-8 M9 21v-8 M15 21v-8 M19 21v-8 M3 10l9-6 9 6Z", bg: "var(--secondary)", fg: "var(--ink-600)" },
  Food: { path: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7", bg: "color-mix(in srgb, var(--warning) 16%, transparent)", fg: "var(--warning-foreground)" },
  Stay: { path: "M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9", bg: "var(--brand-muted)", fg: "var(--corn-600)" },
  Shopping: { path: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z M3 6h18 M16 10a4 4 0 0 1-8 0", bg: "color-mix(in srgb, var(--success) 12%, transparent)", fg: "var(--success-foreground)" },
  Activity: { path: "M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z M13 5v2 M13 11v2 M13 17v2", bg: "color-mix(in srgb, var(--info) 10%, transparent)", fg: "var(--info-foreground)" },
  Walk: { path: "M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z M19 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z M7 19h8a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h8", bg: "var(--secondary)", fg: "var(--ink-600)" },
  Park: { path: "M12 2 7 9h2l-3 5h3l-2 4h10l-2-4h3l-3-5h2Z M12 18v4", bg: "color-mix(in srgb, var(--success) 12%, transparent)", fg: "var(--success-foreground)" },
  Transit: { path: "M4 15V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z M4 11h16 M8 15h.01 M16 15h.01 M9 18l-2 3 M15 18l2 3", bg: "var(--secondary)", fg: "var(--ink-500)" },
  Plan: { path: "M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z", bg: "var(--secondary)", fg: "var(--ink-500)" },
};

export function categoryMeta(cat: StopCategory): CategoryMeta {
  return META[cat] ?? META.Plan;
}

/** Canonical ordered list of stop/expense categories for selectors. */
export const STOP_CATEGORIES = Object.keys(META) as StopCategory[];
