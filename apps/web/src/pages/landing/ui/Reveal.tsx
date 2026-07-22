import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@/shared/lib";
import { useReveal } from "../lib/useReveal";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger against siblings; maps to the `.wf-reveal` delay (ms). */
  delay?: number;
  /** Render element — defaults to a div, pass a semantic tag where it fits. */
  as?: ElementType;
}

/** Wraps content in the scroll-reveal utility, playing the lift-and-fade the
 * first time it enters the viewport. */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }: RevealProps) {
  const { ref, shown } = useReveal<HTMLElement>();
  return (
    <Tag
      ref={ref}
      data-shown={shown}
      className={cn("wf-reveal", className)}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
