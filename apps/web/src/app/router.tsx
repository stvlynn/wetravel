import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getWechatMiniProgramBridge } from "@/shared/lib";
import { useIsMiniappEmbedded } from "./embedded-environment";

type Listener = () => void;

const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function getSnapshot() {
  return window.location.pathname;
}

function emit() {
  for (const l of listeners) l();
}

interface NavigateOptions {
  /**
   * Human-readable title for the destination (e.g. the trip title). Inside
   * the Mini Program it pre-labels the native navigation bar before the
   * destination WebView finishes loading.
   */
  title?: string;
}

interface RouterValue {
  path: string;
  navigate: (to: string, options?: NavigateOptions) => void;
  /** SPA-only replace; never forwarded to the native page stack. */
  replace: (to: string) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const path = useSyncExternalStore(subscribe, getSnapshot, () => "/");
  const embedded = useIsMiniappEmbedded();

  const navigate = useCallback(
    (to: string, options?: NavigateOptions) => {
      if (to === window.location.pathname) return;
      if (embedded && navigateNativeStack(to, options?.title)) return;
      window.history.pushState(null, "", to);
      emit();
    },
    [embedded],
  );

  const replace = useCallback((to: string) => {
    if (to === window.location.pathname) return;
    window.history.replaceState(null, "", to);
    emit();
  }, []);

  const value = useMemo(
    () => ({ path, navigate, replace }),
    [path, navigate, replace],
  );
  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used within RouterProvider");
  return ctx;
}

/** Extracts a trip id from `/trips/:id`, else null (trips home). */
export function matchTripId(path: string): string | null {
  const m = /^\/trips\/([^/]+)$/.exec(path);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** Extracts an invite token from `/invite/:token`, else null. */
export function matchInviteToken(path: string): string | null {
  const m = /^\/invite\/([^/]+)$/.exec(path);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** Extracts a travelogue entry id from `/journal/:entryId`, else null. */
export function matchJournalEntryId(path: string): string | null {
  const m = /^\/journal\/([^/]+)$/.exec(path);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** The authenticated home hub surfaces, all owned by `pages/trips`. */
const HUB_PATHS: ReadonlySet<string> = new Set(["/", "/today", "/journal"]);

/** Whether a path maps to a real route. Unknown paths render the 404 surface
 *  instead of silently falling back to the trips home. */
export function isKnownPath(path: string): boolean {
  if (HUB_PATHS.has(path) || path === "/signin" || path === "/miniapp") {
    return true;
  }
  return (
    matchTripId(path) !== null ||
    matchInviteToken(path) !== null ||
    matchJournalEntryId(path) !== null
  );
}

/**
 * Routes page-level transitions through the WeChat native page stack so the
 * Mini Program gets real native navigation (nav bar, back button, swipe
 * back). Each native page hosts one PWA route and receives the target path in
 * its query. Returns false when the destination has no native page or the
 * JSSDK is unavailable, in which case the SPA history fallback applies.
 */
function navigateNativeStack(to: string, title?: string): boolean {
  const bridge = getWechatMiniProgramBridge();
  if (!bridge) return false;
  if (matchTripId(to)) {
    bridge.navigateTo({ url: nativePageUrl("/pages/trip/trip", to, title) });
    return true;
  }
  if (matchInviteToken(to)) {
    bridge.navigateTo({ url: nativePageUrl("/pages/invite/invite", to, title) });
    return true;
  }
  if (HUB_PATHS.has(to)) {
    // Trips / Today / Travelogues are sibling surfaces of the same home page.
    // Switching between them (or from a travelogue reader) stays in the current
    // WebView via SPA history so the native stack is not reset on every tab
    // change. Returning to the hub from a deeper native page (e.g. a trip)
    // resets the stack instead of popping it, so "back to trips" works from any
    // stack shape (including share-card entries where the trip page is the
    // stack bottom).
    const current = window.location.pathname;
    if (HUB_PATHS.has(current) || matchJournalEntryId(current)) return false;
    bridge.reLaunch({ url: nativePageUrl("/pages/home/home", to) });
    return true;
  }
  // `/journal/:entryId` has no dedicated native page; read it in place through
  // SPA history within the home WebView.
  return false;
}

function nativePageUrl(page: string, path: string, title?: string): string {
  const query = [`path=${encodeURIComponent(path)}`];
  if (title) query.push(`title=${encodeURIComponent(title)}`);
  return `${page}?${query.join("&")}`;
}
