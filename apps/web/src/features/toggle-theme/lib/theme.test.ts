import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, subscribeToThemeChanges } from "./apply-theme";
import { resolveTheme, setStoredTheme } from "./theme-persistence";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme", () => {
  it("resolves explicit modes without consulting the system", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("applies system changes while system mode is selected", () => {
    let systemDark = false;
    const media = new EventTarget() as MediaQueryList;
    Object.defineProperty(media, "matches", { get: () => systemDark });
    const windowTarget = new EventTarget() as Window & typeof globalThis;
    Object.assign(windowTarget, { matchMedia: () => media });

    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const toggle = vi.fn();

    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("document", { documentElement: { classList: { toggle } } });

    setStoredTheme("system");
    applyTheme();
    expect(toggle).toHaveBeenLastCalledWith("dark", false);

    const unsubscribe = subscribeToThemeChanges();
    systemDark = true;
    media.dispatchEvent(new Event("change"));
    expect(toggle).toHaveBeenLastCalledWith("dark", true);

    unsubscribe();
  });
});
