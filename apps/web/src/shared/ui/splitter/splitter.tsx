import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Separator } from "@base-ui/react/separator";
import { cn } from "@/shared/lib";

export interface SplitterProps {
  /** Orientation of the two panels. The separator orientation is the inverse. */
  orientation?: "horizontal" | "vertical";
  /** Current size of the primary pane as a percentage between `min` and `max`. */
  value: number;
  /** Minimum allowed value. Defaults to `0`. */
  min?: number;
  /** Maximum allowed value. Defaults to `100`. */
  max?: number;
  /** Step size for keyboard resizing. Defaults to `1`. */
  step?: number;
  /** Large step size for keyboard resizing (PageUp/PageDown). Defaults to `10`. */
  jumpStep?: number;
  /** `id` of the primary pane, referenced by `aria-controls`. */
  primaryPaneId: string;
  /** Accessible name for the separator. Use `aria-labelledby` when the primary pane has a visible label. */
  "aria-label"?: string;
  /** IDs of visible labels describing the primary pane. */
  "aria-labelledby"?: string;
  /** Called while the splitter is being moved. */
  onChange?: (value: number) => void;
  /** Called once a move gesture completes (pointer up or key release). */
  onChangeEnd?: (value: number) => void;
  /** Primary pane first, secondary pane second. */
  children: [React.ReactNode, React.ReactNode];
}

interface DragStart {
  pointer: number;
  value: number;
}

/** Clamp a number between `min` and `max`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Snap a value to the nearest step. */
export function snap(value: number, step: number, min: number): number {
  const steps = Math.round((value - min) / step);
  return min + steps * step;
}

/**
 * A focusable, keyboard- and pointer-operable window splitter.
 *
 * Follows the WAI-ARIA APG Window Splitter pattern:
 * - `role="separator"` on the focusable splitter element.
 * - `aria-valuenow`, `aria-valuemin`, `aria-valuemax` expose the primary pane size.
 * - `aria-controls` references the primary pane.
 * - Arrow keys resize; `Enter` collapses/restores; `Home`/`End` jump to min/max.
 */
export function Splitter({
  orientation = "horizontal",
  value,
  min = 0,
  max = 100,
  step = 1,
  jumpStep = 10,
  primaryPaneId,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  onChange,
  onChangeEnd,
  children,
}: SplitterProps) {
  const generatedPrimaryId = useId();
  const primaryId = primaryPaneId || generatedPrimaryId;
  const separatorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const previousValueRef = useRef(value);
  const [isDragging, setIsDragging] = useState(false);

  const isHorizontalPanels = orientation === "horizontal";
  const separatorOrientation = isHorizontalPanels ? "vertical" : "horizontal";

  // Remember the last non-collapsed value so Enter can restore it.
  useEffect(() => {
    if (value > min) {
      previousValueRef.current = value;
    }
  }, [value, min]);

  const move = useCallback(
    (deltaPercent: number, fromValue: number, shouldSnap = true) => {
      let next = clamp(fromValue + deltaPercent, min, max);
      if (shouldSnap) {
        next = snap(next, step, min);
      }
      onChange?.(next);
    },
    [min, max, step, onChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const isVerticalSplitter = separatorOrientation === "vertical";
      let handled = false;
      let nextValue = value;

      switch (event.key) {
        case "ArrowLeft":
          if (isVerticalSplitter) {
            nextValue = value - (event.shiftKey ? jumpStep : step);
            handled = true;
          }
          break;
        case "ArrowRight":
          if (isVerticalSplitter) {
            nextValue = value + (event.shiftKey ? jumpStep : step);
            handled = true;
          }
          break;
        case "ArrowUp":
          if (!isVerticalSplitter) {
            nextValue = value - (event.shiftKey ? jumpStep : step);
            handled = true;
          }
          break;
        case "ArrowDown":
          if (!isVerticalSplitter) {
            nextValue = value + (event.shiftKey ? jumpStep : step);
            handled = true;
          }
          break;
        case "Home":
          nextValue = min;
          handled = true;
          break;
        case "End":
          nextValue = max;
          handled = true;
          break;
        case "Enter": {
          handled = true;
          if (value <= min) {
            const restored = Math.max(previousValueRef.current, min + step);
            nextValue = Math.min(restored, max);
          } else {
            previousValueRef.current = value;
            nextValue = min;
          }
          break;
        }
      }

      if (handled) {
        event.preventDefault();
        const clamped = clamp(nextValue, min, max);
        if (clamped !== value) {
          onChange?.(clamped);
          onChangeEnd?.(clamped);
        }
      }
    },
    [value, min, max, step, jumpStep, separatorOrientation, onChange, onChangeEnd],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      separatorRef.current?.setPointerCapture(event.pointerId);
      dragStartRef.current = {
        pointer: isHorizontalPanels ? event.clientX : event.clientY,
        value,
      };
      setIsDragging(true);
    },
    [isHorizontalPanels, value],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current || !containerRef.current) return;
      const current = isHorizontalPanels ? event.clientX : event.clientY;
      const deltaPx = current - dragStartRef.current.pointer;
      const containerSize = isHorizontalPanels
        ? containerRef.current.clientWidth
        : containerRef.current.clientHeight;
      if (containerSize === 0) return;
      const deltaPercent = (deltaPx / containerSize) * 100;
      move(deltaPercent, dragStartRef.current.value, false);
    },
    [isHorizontalPanels, move],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return;
      separatorRef.current?.releasePointerCapture(event.pointerId);
      dragStartRef.current = null;
      setIsDragging(false);
      onChangeEnd?.(value);
    },
    [value, onChangeEnd],
  );

  // Disable text selection during drag.
  useLayoutEffect(() => {
    if (!isDragging) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [isDragging]);

  const gridTemplate = `minmax(0px, ${value}%) var(--space-3) minmax(0px, 1fr)`;

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid flex-1 min-h-0 min-w-0",
        isDragging && "cursor-grabbing",
      )}
      style={{
        gridTemplateColumns: isHorizontalPanels ? gridTemplate : undefined,
        gridTemplateRows: !isHorizontalPanels ? gridTemplate : undefined,
      }}
    >
      <div
        id={primaryId}
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      >
        {children[0]}
      </div>

      <Separator
        orientation={separatorOrientation}
        render={(props) => (
          <div
            {...props}
            ref={separatorRef}
            role="separator"
            tabIndex={0}
            aria-valuenow={Math.round(value)}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-orientation={separatorOrientation}
            aria-controls={primaryId}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={handlePointerMove}
            className={cn(
              "group relative flex focus:outline-none",
              isHorizontalPanels
                ? "h-full w-full cursor-col-resize"
                : "h-full w-full cursor-row-resize",
            )}
          >
            <span
              className={cn(
                "pointer-events-none absolute block bg-border transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                isHorizontalPanels
                  ? "inset-y-0 left-1/2 w-px -translate-x-1/2"
                  : "inset-x-0 top-1/2 h-px -translate-y-1/2",
                "group-hover:bg-ring group-focus-visible:bg-ring",
              )}
            />
          </div>
        )}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children[1]}
      </div>
    </div>
  );
}
