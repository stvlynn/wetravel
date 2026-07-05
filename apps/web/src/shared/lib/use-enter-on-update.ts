import { useEffect, useRef, useState } from "react";

/** True when `dep` changes after the first render — use to gate `wf-enter` on updates only. */
export function useEnterOnUpdate<T>(dep: T): boolean {
  const isFirst = useRef(true);
  const prev = useRef(dep);
  const [shouldEnter, setShouldEnter] = useState(false);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      prev.current = dep;
      return;
    }
    if (prev.current !== dep) {
      prev.current = dep;
      setShouldEnter(true);
    }
  }, [dep]);

  return shouldEnter;
}
