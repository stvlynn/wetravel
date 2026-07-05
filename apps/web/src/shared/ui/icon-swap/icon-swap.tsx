import type { ReactNode } from "react";
import { cn } from "@/shared/lib";

export interface IconSwapProps {
  /** When true, cross-fades from `from` to `to`. */
  active: boolean;
  /** Icon shown in the resting (inactive) state. */
  from: ReactNode;
  /** Icon revealed in the active state. */
  to: ReactNode;
  /** Also swap on hover (fine pointers only). Use for hover-reveal glyphs. */
  hoverSwap?: boolean;
  className?: string;
}

/** Contextual icon cross-fade — both glyphs stay in the DOM and blend with
 * opacity/scale/blur (the single implementation behind `.wf-icon-swap`).
 * State-driven by default; opt into hover reveal with `hoverSwap`. */
export function IconSwap({
  active,
  from,
  to,
  hoverSwap,
  className,
}: IconSwapProps) {
  return (
    <span
      className={cn("wf-icon-swap", className)}
      data-state={active ? "active" : undefined}
      data-hover-swap={hoverSwap ? "" : undefined}
      aria-hidden="true"
    >
      {from}
      {to}
    </span>
  );
}
