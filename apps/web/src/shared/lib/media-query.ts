import { useCallback, useSyncExternalStore } from "react";

/**
 * Mirrors the Tailwind `md` breakpoint (768px). The 767.9px ceiling keeps the
 * JS branch and `md:` CSS variants from disagreeing at exactly 768px.
 */
export const MOBILE_MEDIA_QUERY = "(max-width: 767.9px)";

export function subscribeToMediaQuery(
  query: string,
  listener: () => void,
): () => void {
  const media = window.matchMedia(query);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

export function matchesMediaQuery(query: string): boolean {
  return window.matchMedia(query).matches;
}

/** Reactively tracks a CSS media query via matchMedia. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => subscribeToMediaQuery(query, listener),
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => matchesMediaQuery(query),
    () => false,
  );
}

/** True below the Tailwind `md` breakpoint — the app-wide mobile layout switch. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
