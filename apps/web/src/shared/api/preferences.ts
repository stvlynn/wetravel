import { apiFetch } from "./client";

export interface PlannerSidebarPreference {
  width: number;
  collapsed: boolean;
}

export interface UserPreference {
  userId: string;
  plannerSidebar: PlannerSidebarPreference;
  updatedAt: string;
}

export interface UpdatePreferencesInput {
  plannerSidebarWidth: number;
  plannerSidebarCollapsed: boolean;
}

export function fetchPreferences(): Promise<UserPreference> {
  return apiFetch<UserPreference>("/api/users/preferences");
}

export function updatePreferences(
  input: UpdatePreferencesInput,
): Promise<UserPreference> {
  return apiFetch<UserPreference>("/api/users/preferences", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
