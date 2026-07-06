import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/shared/config/theme";

export type ThemeMode = "system" | "light" | "dark";

export function getStoredTheme(): ThemeMode {
  if (typeof localStorage === "undefined") return "system";
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function setStoredTheme(mode: ThemeMode): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Resolved light/dark theme that stays in sync with user preference, system
 * changes, and storage events from other tabs. */
export function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState(() => resolveTheme(getStoredTheme()));

  useEffect(() => {
    const sync = () => setTheme(resolveTheme(getStoredTheme()));
    window.addEventListener("storage", sync);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      media.removeEventListener("change", sync);
    };
  }, []);

  return theme;
}
