import { THEME_STORAGE_KEY } from "@/shared/config/theme";
import { getStoredTheme, resolveTheme } from "./theme-persistence";

/** Apply the persisted theme to the document root. Call once at app boot. */
export function applyTheme(): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(getStoredTheme());
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

/** Keep system mode synchronized with OS changes and other tabs. */
export function subscribeToThemeChanges(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const syncSystemTheme = () => {
    if (getStoredTheme() === "system") applyTheme();
  };
  const syncStoredTheme = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) applyTheme();
  };
  media.addEventListener("change", syncSystemTheme);
  window.addEventListener("storage", syncStoredTheme);
  return () => {
    media.removeEventListener("change", syncSystemTheme);
    window.removeEventListener("storage", syncStoredTheme);
  };
}
