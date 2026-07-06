import type { Pool } from "pg";
import type {
  PlannerSidebarPreference,
  UserPreferenceSnapshot,
} from "../../domain/preferences/types";
import type { UserPreferenceRepository } from "../../domain/preferences/ports";

const DEFAULT_PREFERENCE: PlannerSidebarPreference = {
  width: 30,
  collapsed: false,
};

/** PostgreSQL adapter for per-user UI preferences. */
export class PgUserPreferenceRepository implements UserPreferenceRepository {
  constructor(private pool: Pool) {}

  async findByUserId(userId: string): Promise<UserPreferenceSnapshot> {
    const { rows } = await this.pool.query<{
      planner_sidebar_width: number;
      planner_sidebar_collapsed: boolean;
      updated_at: Date;
    }>(
      `SELECT planner_sidebar_width, planner_sidebar_collapsed, updated_at
       FROM user_preferences
       WHERE user_id = $1`,
      [userId],
    );

    const row = rows[0];
    if (!row) {
      return {
        userId,
        plannerSidebar: { ...DEFAULT_PREFERENCE },
        updatedAt: new Date(),
      };
    }

    return {
      userId,
      plannerSidebar: {
        width: Number(row.planner_sidebar_width),
        collapsed: row.planner_sidebar_collapsed,
      },
      updatedAt: row.updated_at,
    };
  }

  async updatePlannerSidebar(
    userId: string,
    width: number,
    collapsed: boolean,
  ): Promise<UserPreferenceSnapshot> {
    const { rows } = await this.pool.query<{
      planner_sidebar_width: number;
      planner_sidebar_collapsed: boolean;
      updated_at: Date;
    }>(
      `INSERT INTO user_preferences (user_id, planner_sidebar_width, planner_sidebar_collapsed, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id)
       DO UPDATE SET
         planner_sidebar_width = EXCLUDED.planner_sidebar_width,
         planner_sidebar_collapsed = EXCLUDED.planner_sidebar_collapsed,
         updated_at = EXCLUDED.updated_at
       RETURNING planner_sidebar_width, planner_sidebar_collapsed, updated_at`,
      [userId, width, collapsed],
    );

    const row = rows[0]!;
    return {
      userId,
      plannerSidebar: {
        width: Number(row.planner_sidebar_width),
        collapsed: row.planner_sidebar_collapsed,
      },
      updatedAt: row.updated_at,
    };
  }
}
