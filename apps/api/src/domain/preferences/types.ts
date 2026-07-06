/**
 * User preference value objects.
 *
 * Preferences are not a core domain aggregate; they are UI chrome that happens
 * to be persisted per user. The model is intentionally thin — just snapshots
 * that the repository loads and the application layer maps to DTOs.
 */

export interface PlannerSidebarPreference {
  /** Width as a percentage of the available space (0–100). */
  width: number;
  /** Whether the primary pane is currently collapsed. */
  collapsed: boolean;
}

export interface UserPreferenceSnapshot {
  userId: string;
  plannerSidebar: PlannerSidebarPreference;
  updatedAt: Date;
}
