import { useEffect, useRef, useState } from "react";

/**
 * Reveals an element the first time it scrolls into view. Returns a ref and a
 * `shown` flag; wire `shown` to the `.wf-reveal` utility's `data-shown` so the
 * lift-and-fade plays once and stays. When IntersectionObserver is missing
 * (older WebViews, SSR), content is shown immediately rather than hidden.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);

  return { ref, shown };
}
