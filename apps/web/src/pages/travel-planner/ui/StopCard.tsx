import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import { CategoryIcon, type Stop } from "@/entities/stop";
import { cn, formatMoney } from "@/shared/lib";

export interface StopCardDragHandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (e: ReactMouseEvent<HTMLElement>) => void;
}

export interface StopCardProps {
  trip: Trip;
  stop: Stop;
  /** Highlight the card as the active selection. */
  selected?: boolean;
  /** Visual and pointer state when the schedule board uses the card as a drag handle. */
  dragging?: boolean;
  dragHandleProps?: StopCardDragHandleProps;
  className?: string;
  style?: CSSProperties;
  onSelect: (id: string) => void;
}

/** Single itinerary stop rendered as a card. Shared between the schedule board
 * columns and the sidebar list so both surfaces stay visually identical. */
export function StopCard({
  trip,
  stop,
  selected,
  dragging = false,
  dragHandleProps,
  className,
  style,
  onSelect,
}: StopCardProps) {
  const { t } = useTranslation("planner");

  const meta = [
    t(`category.${stop.category}`),
    stop.cost
      ? t("detail.perPerson", {
          amount: formatMoney(stop.cost, stop.costCurrency || trip.currency),
        })
      : null,
    stop.votes.length
      ? t("schedule.voteCount", { count: stop.votes.length })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      {...dragHandleProps}
      onClick={() => onSelect(stop.id)}
      className={cn(
        "flex flex-col gap-1 rounded-lg bg-card p-2.5 text-left shadow-[var(--shadow-border)] transition-[background-color,box-shadow,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-accent hover:shadow-[var(--shadow-border-hover)] active:scale-[var(--press-scale)]",
        selected && "bg-accent shadow-[var(--shadow-border-hover)]",
        dragHandleProps &&
          (dragging ? "touch-none cursor-grabbing" : "touch-none cursor-grab"),
        dragging && "opacity-90 shadow-[var(--shadow-lg)] transition-none",
        className,
      )}
      style={style}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {stop.time}
        </span>
        <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {stop.duration}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <CategoryIcon category={stop.category} />
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-pretty">
          {stop.name}
        </span>
      </div>
      <span className="pl-7 text-xs text-muted-foreground text-pretty tabular-nums">
        {meta}
      </span>
    </button>
  );
}
