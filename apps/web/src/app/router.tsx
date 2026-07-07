import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

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

interface RouterValue {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const path = useSyncExternalStore(subscribe, getSnapshot, () => "/");

  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState(null, "", to);
    emit();
  }, []);

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);
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
