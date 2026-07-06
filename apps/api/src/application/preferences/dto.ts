export interface PlannerSidebarPreferenceDto {
  width: number;
  collapsed: boolean;
}

export interface UserPreferenceDto {
  userId: string;
  plannerSidebar: PlannerSidebarPreferenceDto;
  updatedAt: string;
}
