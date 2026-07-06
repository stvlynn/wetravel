import type { UserPreferenceRepository } from "../../domain/preferences/ports";
import type { UserPreferenceDto } from "./dto";

function toDto(snapshot: {
  userId: string;
  plannerSidebar: { width: number; collapsed: boolean };
  updatedAt: Date;
}): UserPreferenceDto {
  return {
    userId: snapshot.userId,
    plannerSidebar: {
      width: snapshot.plannerSidebar.width,
      collapsed: snapshot.plannerSidebar.collapsed,
    },
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

/** Application service for per-user UI preferences. */
export class PreferenceService {
  constructor(private repo: UserPreferenceRepository) {}

  async getPreferences(userId: string): Promise<UserPreferenceDto> {
    return toDto(await this.repo.findByUserId(userId));
  }

  async updatePlannerSidebar(
    userId: string,
    width: number,
    collapsed: boolean,
  ): Promise<UserPreferenceDto> {
    return toDto(await this.repo.updatePlannerSidebar(userId, width, collapsed));
  }
}
