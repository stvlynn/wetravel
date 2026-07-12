import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOBILE_MEDIA_QUERY,
  matchesMediaQuery,
  subscribeToMediaQuery,
} from "./media-query";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { get: () => matches });
  const windowTarget = new EventTarget() as Window & typeof globalThis;
  Object.assign(windowTarget, { matchMedia: () => media });
  vi.stubGlobal("window", windowTarget);
  return {
    media,
    setMatches: (next: boolean) => {
      matches = next;
      media.dispatchEvent(new Event("change"));
    },
  };
}

describe("media-query", () => {
  it("keeps the mobile query just under the Tailwind md breakpoint", () => {
    expect(MOBILE_MEDIA_QUERY).toBe("(max-width: 767.9px)");
  });

  it("reads the current match state", () => {
    stubMatchMedia(true);
    expect(matchesMediaQuery(MOBILE_MEDIA_QUERY)).toBe(true);
  });

  it("notifies on change and stops after unsubscribe", () => {
    const { setMatches } = stubMatchMedia(false);
    const listener = vi.fn();
    const unsubscribe = subscribeToMediaQuery(MOBILE_MEDIA_QUERY, listener);

    setMatches(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(matchesMediaQuery(MOBILE_MEDIA_QUERY)).toBe(true);

    unsubscribe();
    setMatches(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
