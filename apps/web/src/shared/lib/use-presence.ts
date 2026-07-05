import { useEffect, useState } from "react";

const DEFAULT_EXIT_MS = 200;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Delays unmount until `wf-exit` finishes. Skips delay when reduced motion is preferred. */
export function usePresence(
  visible: boolean,
  durationMs = DEFAULT_EXIT_MS,
): { mounted: boolean; exiting: boolean } {
  const [mounted, setMounted] = useState(visible);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setExiting(false);
      return;
    }

    if (!mounted) return;

    if (prefersReducedMotion()) {
      setMounted(false);
      setExiting(false);
      return;
    }

    setExiting(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [visible, mounted, durationMs]);

  return { mounted, exiting };
}
