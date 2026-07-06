import type { UserPreferenceSnapshot } from "./types";

/** Repository port for per-user UI preferences. */
export interface UserPreferenceRepository {
  /** Load preferences for a user, returning defaults if no row exists. */
  findByUserId(userId: string): Promise<UserPreferenceSnapshot>;
  /** Persist planner sidebar preferences for a user. */
  updatePlannerSidebar(
    userId: string,
    width: number,
    collapsed: boolean,
  ): Promise<UserPreferenceSnapshot>;
}
