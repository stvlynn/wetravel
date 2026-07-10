import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { Trip, TripDay } from "@/entities/trip";
import { dayDateLabel } from "@/entities/trip";
import {
  CategoryIcon,
  STOP_CATEGORIES,
  type Stop,
  type StopCategory,
} from "@/entities/stop";
import type { PlaceResult, UpdateTripDayInput } from "@/shared/api";
import { cn, CURRENCIES, currencySelectItems } from "@/shared/lib";
import {
  CurrencyLabel,
  currencySelectPopupClass,
  currencySelectTriggerClass,
  currencySelectValueClass,
} from "@/shared/ui/currency-label";
import { Button } from "@/shared/ui/button";
import {
  DayColorPickerContent,
  DEFAULT_DAY_COLOR_PRESETS,
} from "@/shared/ui/day-color-picker";
import {
  ContextMenu,
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { PlaceSearch } from "./PlaceSearch";
import { StopCard, type StopCardDragHandleProps } from "./StopCard";
import { DayWeatherIcon } from "@/features/weather";

const CATEGORY_OPTIONS = STOP_CATEGORIES;

/** Half-hourly time options for the schedule time picker. */
const TIME_OPTIONS: { label: string; value: string }[] = Array.from(
  { length: 48 },
  (_, i) => {
    const hh = String(Math.floor(i / 2)).padStart(2, "0");
    const mm = i % 2 ? "30" : "00";
    const value = `${hh}:${mm}`;
    return { label: value, value };
  },
);

/** Duration presets, matching the stop detail schedule editor. */
const DURATION_OPTIONS = [
  "0.5h",
  "1h",
  "1.5h",
  "2h",
  "2.5h",
  "3h",
  "4h",
  "5h",
  "6h",
  "8h",
];

export interface ComposeDraft {
  day: number;
  index: number;
  name: string;
  time: string;
  duration?: string;
  lat?: number;
  lng?: number;
  area?: string;
  category?: StopCategory;
  cost?: number;
  /** ISO currency code for `cost`. Defaults to the user's preferred currency. */
  costCurrency?: string;
  note?: string;
}

interface ScheduleBoardProps {
  trip: Trip;
  /** The active insert draft, lifted to the page so it survives a tab switch
   * during map picking. */
  compose: ComposeDraft | null;
  /** Currency preselected for a new stop cost (user preference, else trip). */
  defaultCurrency: string;
  biasLat?: number;
  biasLng?: number;
  onOpen: (day: number, index: number) => void;
  onChange: (patch: Partial<ComposeDraft>) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onPickOnMap: () => void;
  onSelectStop: (id: string) => void;
  /** Append a new empty day to the itinerary. */
  onAddDay: () => void;
  /** Update display metadata for an itinerary day. */
  onUpdateDay: (dayNumber: number, patch: UpdateTripDayInput) => void;
  /** Delete an itinerary day and its stops. */
  onDeleteDay: (dayNumber: number) => void;
  /** Persist a new day order (sequence of current day numbers). */
  onReorderDays: (order: number[]) => void;
  /** Move a stop to a position within any itinerary day. */
  onMoveStop: (input: { stopId: string; day: number; index: number }) => void;
  addingDay?: boolean;
  deletingDayNumber?: number;
  updatingDayNumber?: number;
}

export function ScheduleBoard({
  trip,
  compose,
  defaultCurrency,
  biasLat,
  biasLng,
  onOpen,
  onChange,
  onConfirm,
  onCancel,
  onPickOnMap,
  onSelectStop,
  onAddDay,
  onUpdateDay,
  onDeleteDay,
  onReorderDays,
  onMoveStop,
  addingDay = false,
  deletingDayNumber,
  updatingDayNumber,
}: ScheduleBoardProps) {
  const { t, i18n } = useTranslation("planner");
  const locale = i18n.language;
  const dayNumbers = trip.days.map((d) => d.number);
  const drag = useDayReorderDrag(dayNumbers, onReorderDays);
  const stopDrag = useStopMoveDrag(trip, onMoveStop);
  const pan = useBoardPan();
  const setGridRef = useCallback(
    (el: HTMLDivElement | null) => {
      drag.gridRef.current = el;
      stopDrag.gridRef.current = el;
    },
    [drag.gridRef, stopDrag.gridRef],
  );
  const [editingDayNumber, setEditingDayNumber] = useState<number | null>(null);
  const [deleteDialogDayNumber, setDeleteDialogDayNumber] = useState<number | null>(null);
  const editingDay = trip.days.find((d) => d.number === editingDayNumber) ?? null;
  const deletingDay = trip.days.find((d) => d.number === deleteDialogDayNumber) ?? null;
  const editingDayStops = editingDay
    ? trip.stops.filter((s) => s.day === editingDay.number)
    : [];
  const editingSuggestedCity = editingDay
    ? inferDayLocation(editingDayStops)
    : "";
  const locationOptions = buildLocationOptions(trip);

  const insertSlot = (day: number, index: number) =>
    compose?.day === day && compose.index === index ? (
      <InsertComposer
        key={`compose-${day}-${index}`}
        compose={compose}
        biasLat={biasLat}
        biasLng={biasLng}
        defaultCurrency={defaultCurrency}
        onChange={onChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onPickOnMap={onPickOnMap}
      />
    ) : (
      <InsertTrigger
        label={t("schedule.insert")}
        active={
          stopDrag.dropTargetSlot?.day === day &&
          stopDrag.dropTargetSlot?.index === index
        }
        onClick={() => onOpen(day, index)}
      />
    );

  return (
    <div
      ref={pan.scrollerRef}
      onPointerDown={pan.onPointerDown}
      onPointerMove={pan.onPointerMove}
      onPointerUp={pan.onPointerUp}
      onPointerCancel={pan.onPointerUp}
      className={cn(
        "scrollbar-none h-full min-h-0 overflow-auto p-[62px_22px_20px]",
        "[&_button:not([data-drag-handle])]:cursor-pointer [&_input]:cursor-text [&_textarea]:cursor-text",
        pan.active ? "cursor-grabbing select-none" : "cursor-grab",
        (drag.active || stopDrag.active) && "select-none",
      )}
    >
      <div
        ref={setGridRef}
        className={cn(
          "relative grid min-w-[1180px] gap-3.5",
          (drag.active || stopDrag.active) && "select-none",
        )}
        style={{
          gridTemplateColumns: `repeat(${trip.days.length + 1}, minmax(228px, 1fr))`,
        }}
      >
        {drag.lineX != null ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 z-40 w-0.5 -translate-x-1/2 rounded-full bg-brand"
            style={{ left: drag.lineX }}
          />
        ) : null}
        {trip.days.map((d, dayIndex) => {
          const dayStops = trip.stops.filter((s) => s.day === d.number);
          const date = dayDateLabel(trip, d, locale);
          const headerMeta = [date, d.city].filter(Boolean).join(" · ");
          const suggestedCity = inferDayLocation(dayStops);
          const isDragged = drag.draggedNumber === d.number;
          return (
            <div
              key={d.number}
              ref={(el) => {
                drag.registerColumn(dayIndex)(el);
                stopDrag.registerColumn(d.number)(el);
              }}
              className={cn(
                "relative flex min-w-[228px] flex-col gap-2.5",
                drag.active &&
                  "transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]",
                isDragged &&
                  "z-30 opacity-90 shadow-[var(--shadow-lg)] transition-none",
              )}
              style={drag.columnStyle(dayIndex, d.number)}
            >
              <DayHeader
                trip={trip}
                day={d}
                headerMeta={headerMeta}
                suggestedCity={suggestedCity}
                saving={updatingDayNumber === d.number}
                deleting={deletingDayNumber === d.number}
                dragging={isDragged}
                dragHandleProps={drag.handleProps(dayIndex, d.number)}
                onEdit={() => setEditingDayNumber(d.number)}
                onDelete={() => setDeleteDialogDayNumber(d.number)}
                onUseSuggestedCity={() =>
                  onUpdateDay(d.number, { city: suggestedCity })
                }
              />

              <div className="flex flex-col">
                {insertSlot(d.number, 0)}
                {dayStops.map((s, idx) => (
                  <div
                    key={s.id}
                    ref={stopDrag.registerStop(s.id)}
                    className="flex flex-col"
                  >
                    <StopCard
                      trip={trip}
                      stop={s}
                      dragging={stopDrag.draggedStopId === s.id}
                      dragHandleProps={stopDrag.handleProps(s.id, d.number)}
                      style={stopDrag.stopStyle(s.id)}
                      onSelect={onSelectStop}
                    />
                    {insertSlot(d.number, idx + 1)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex min-w-[228px] flex-col gap-2.5">
          <button
            type="button"
            onClick={onAddDay}
            disabled={addingDay}
            className="group flex h-[62px] items-center gap-1.5 rounded-xl border border-dashed border-border bg-card p-2.5 text-muted-foreground shadow-xs transition-[border-color,background-color,color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:border-border-strong hover:bg-accent hover:text-foreground active:scale-[var(--press-scale)] disabled:pointer-events-none disabled:opacity-60"
          >
            <span className="flex size-2.5 flex-none items-center justify-center rounded-full bg-accent text-corn-600 transition-[background-color] group-hover:bg-brand-muted">
              <svg
                viewBox="0 0 24 24"
                className="size-2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
            <span className="font-heading text-base font-semibold">
              {t("days.add")}
            </span>
          </button>
        </div>
      </div>

      <DayEditorDialog
        trip={trip}
        day={editingDay}
        suggestedCity={editingSuggestedCity}
        locationOptions={locationOptions}
        saving={
          editingDay != null && updatingDayNumber === editingDay.number
        }
        onOpenChange={(open) => {
          if (!open) setEditingDayNumber(null);
        }}
        onSubmit={(dayNumber, patch) => {
          onUpdateDay(dayNumber, patch);
          setEditingDayNumber(null);
        }}
      />

      <DeleteDayDialog
        day={deletingDay}
        deletingDayNumber={deleteDialogDayNumber}
        onOpenChange={(open) => {
          if (!open) setDeleteDialogDayNumber(null);
        }}
        onConfirm={(dayNumber) => {
          onDeleteDay(dayNumber);
          setDeleteDialogDayNumber(null);
        }}
      />
    </div>
  );
}

/** Props spread onto a day-header card to make it the reorder drag handle. */
interface DayDragHandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

/** Snapshot of a day column's horizontal extent, in grid-content coordinates. */
interface ColumnRect {
  left: number;
  right: number;
}

interface DragState {
  dayNumber: number;
  index: number;
  dx: number;
  dy: number;
  /** Post-removal insertion index into the remaining columns (0..N-1). */
  targetIndex: number;
}

/** Pointer distance (px) before a press on a day header becomes a drag, so a
 * plain click or right-click still reaches the context menu. */
const DRAG_THRESHOLD = 4;

/** Interactive / drag surfaces that must not start board panning. */
const BOARD_PAN_BLOCK =
  'a, button, input, textarea, select, label, [role="button"], [role="menuitem"], [contenteditable="true"], [data-drag-handle], [data-no-pan]';

/**
 * Grab-to-pan the schedule board on empty space. Interactive controls and
 * day/stop drag handles opt out via {@link BOARD_PAN_BLOCK}.
 */
function useBoardPan() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const session = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [active, setActive] = useState(false);

  const end = useCallback((el: HTMLDivElement, pointerId: number) => {
    if (el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
    session.current = null;
    setActive(false);
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(BOARD_PAN_BLOCK)) return;
    if (!el.contains(target)) return;

    session.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    el.setPointerCapture(e.pointerId);
    setActive(true);
    e.preventDefault();
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    const s = session.current;
    if (!el || !s || s.pointerId !== e.pointerId) return;
    el.scrollLeft = s.scrollLeft - (e.clientX - s.startX);
    el.scrollTop = s.scrollTop - (e.clientY - s.startY);
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const el = scrollerRef.current;
      const s = session.current;
      if (!el || !s || s.pointerId !== e.pointerId) return;
      end(el, e.pointerId);
    },
    [end],
  );

  return { scrollerRef, active, onPointerDown, onPointerMove, onPointerUp };
}

/** Drag-to-reorder for day columns. Dragging a day header lifts the whole
 * column (header + stops move together) and shows a vertical line at the
 * insertion point; dropping commits the new order via `onReorderDays`. */
function useDayReorderDrag(
  dayNumbers: number[],
  onReorderDays: (order: number[]) => void,
) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columnEls = useRef(new Map<number, HTMLDivElement>());
  const rects = useRef<ColumnRect[]>([]);
  const pending = useRef<{
    index: number;
    dayNumber: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const setDragState = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const registerColumn = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      if (el) columnEls.current.set(index, el);
      else columnEls.current.delete(index);
    },
    [],
  );

  const snapshotRects = useCallback((): ColumnRect[] => {
    const grid = gridRef.current;
    if (!grid) return [];
    const gridLeft = grid.getBoundingClientRect().left;
    return dayNumbers.map((_, i) => {
      const el = columnEls.current.get(i);
      const r = el?.getBoundingClientRect();
      return r
        ? { left: r.left - gridLeft, right: r.right - gridLeft }
        : { left: 0, right: 0 };
    });
  }, [dayNumbers]);

  const computeTargetIndex = useCallback(
    (index: number, dx: number): number => {
      const list = rects.current;
      const dragged = list[index];
      if (!dragged) return index;
      const draggedCenter = (dragged.left + dragged.right) / 2 + dx;
      let count = 0;
      list.forEach((r, i) => {
        if (i === index) return;
        if ((r.left + r.right) / 2 < draggedCenter) count += 1;
      });
      return count;
    },
    [],
  );

  const reset = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    pending.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragState(null);
  }, [setDragState]);

  const handleProps = useCallback(
    (index: number, dayNumber: number): DayDragHandleProps => ({
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        pending.current = {
          index,
          dayNumber,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e) => {
        const p = pending.current;
        if (!p || p.pointerId !== e.pointerId) return;
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        const currentDrag = dragRef.current;
        if (
          currentDrag == null &&
          Math.hypot(dx, dy) < DRAG_THRESHOLD
        ) {
          return;
        }
        if (currentDrag == null) rects.current = snapshotRects();
        setDragState({
          dayNumber: p.dayNumber,
          index: p.index,
          dx,
          dy,
          targetIndex: computeTargetIndex(p.index, dx),
        });
      },
      onPointerUp: (e) => {
        const p = pending.current;
        const activeDrag = dragRef.current;
        if (activeDrag && p) {
          const order = nextOrder(
            dayNumbers,
            activeDrag.index,
            activeDrag.targetIndex,
          );
          if (!sameOrder(order, dayNumbers)) onReorderDays(order);
        }
        reset(e);
      },
      onPointerCancel: reset,
    }),
    [
      dayNumbers,
      snapshotRects,
      computeTargetIndex,
      onReorderDays,
      reset,
      setDragState,
    ],
  );

  const columnStyle = useCallback(
    (index: number, dayNumber: number): CSSProperties | undefined => {
      if (!drag) return undefined;
      if (drag.dayNumber === dayNumber) {
        return { transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0)` };
      }

      const x = previewOffsetX(dayNumbers, rects.current, index, drag);
      return x === 0 ? undefined : { transform: `translate3d(${x}px, 0, 0)` };
    },
    [dayNumbers, drag],
  );

  const lineX = (() => {
    if (!drag) return null;
    const order = nextOrder(dayNumbers, drag.index, drag.targetIndex);
    if (sameOrder(order, dayNumbers)) return null;
    return insertionLineX(rects.current, drag.index, drag.targetIndex);
  })();

  return {
    gridRef,
    registerColumn,
    handleProps,
    columnStyle,
    draggedNumber: drag?.dayNumber ?? null,
    active: drag != null,
    lineX,
  };
}

interface StopMoveTarget {
  day: number;
  /** Zero-based position within the target day's stops after removing the stop. */
  index: number;
}

interface StopColumnRect {
  day: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface StopRect {
  id: string;
  top: number;
  bottom: number;
}

interface StopDragSnapshot {
  gridLeft: number;
  gridTop: number;
  columns: StopColumnRect[];
  stops: StopRect[];
}

interface StopDragState {
  stopId: string;
  sourceDay: number;
  dx: number;
  dy: number;
  target: StopMoveTarget | null;
}

/** Drag-to-move for itinerary stop cards. The target index is computed after
 * removing the dragged card, matching the server and optimistic helper. */
function useStopMoveDrag(
  trip: Trip,
  onMoveStop: (input: { stopId: string; day: number; index: number }) => void,
) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columnEls = useRef(new Map<number, HTMLDivElement>());
  const stopEls = useRef(new Map<string, HTMLElement>());
  const snapshot = useRef<StopDragSnapshot | null>(null);
  const pending = useRef<{
    stopId: string;
    sourceDay: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressClick = useRef<string | null>(null);
  const [drag, setDrag] = useState<StopDragState | null>(null);
  const dragRef = useRef<StopDragState | null>(null);

  const setDragState = useCallback((next: StopDragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const registerColumn = useCallback(
    (day: number) => (el: HTMLDivElement | null) => {
      if (el) columnEls.current.set(day, el);
      else columnEls.current.delete(day);
    },
    [],
  );

  const registerStop = useCallback(
    (stopId: string) => (el: HTMLElement | null) => {
      if (el) stopEls.current.set(stopId, el);
      else stopEls.current.delete(stopId);
    },
    [],
  );

  const snapshotRects = useCallback((): StopDragSnapshot | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const gridRect = grid.getBoundingClientRect();
    const columns = trip.days.flatMap((day): StopColumnRect[] => {
      const el = columnEls.current.get(day.number);
      const r = el?.getBoundingClientRect();
      return r
        ? [
            {
              day: day.number,
              left: r.left - gridRect.left,
              right: r.right - gridRect.left,
              top: r.top - gridRect.top,
              bottom: r.bottom - gridRect.top,
            },
          ]
        : [];
    });
    const stops = trip.stops.flatMap((stop): StopRect[] => {
      const el = stopEls.current.get(stop.id);
      const r = el?.getBoundingClientRect();
      return r
        ? [{ id: stop.id, top: r.top - gridRect.top, bottom: r.bottom - gridRect.top }]
        : [];
    });
    return { gridLeft: gridRect.left, gridTop: gridRect.top, columns, stops };
  }, [trip.days, trip.stops]);

  const computeTarget = useCallback(
    (clientX: number, clientY: number, stopId: string): StopMoveTarget | null => {
      const snap = snapshot.current;
      const column = snap
        ? closestStopColumn(snap.columns, clientX - snap.gridLeft)
        : null;
      if (!snap || !column) return null;

      const y = clientY - snap.gridTop;
      let index = 0;
      for (const stop of trip.stops) {
        if (stop.day !== column.day || stop.id === stopId) continue;
        const rect = snap.stops.find((r) => r.id === stop.id);
        if (!rect) continue;
        if (y < (rect.top + rect.bottom) / 2) {
          return { day: column.day, index };
        }
        index += 1;
      }
      return { day: column.day, index };
    },
    [trip.stops],
  );

  const isSameStopPosition = useCallback(
    (stopId: string, target: StopMoveTarget): boolean => {
      const source = trip.stops.find((s) => s.id === stopId);
      if (!source || source.day !== target.day) return false;
      const sourceIndex = trip.stops
        .filter((s) => s.day === source.day)
        .findIndex((s) => s.id === stopId);
      return sourceIndex === target.index;
    },
    [trip.stops],
  );

  const reset = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      pending.current = null;
      snapshot.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setDragState(null);
    },
    [setDragState],
  );

  const handleProps = useCallback(
    (stopId: string, sourceDay: number): StopCardDragHandleProps => ({
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        pending.current = {
          stopId,
          sourceDay,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e) => {
        const p = pending.current;
        if (!p || p.pointerId !== e.pointerId) return;
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        const currentDrag = dragRef.current;
        if (currentDrag == null && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
          return;
        }
        if (currentDrag == null) snapshot.current = snapshotRects();
        e.preventDefault();
        setDragState({
          stopId: p.stopId,
          sourceDay: p.sourceDay,
          dx,
          dy,
          target: computeTarget(e.clientX, e.clientY, p.stopId),
        });
      },
      onPointerUp: (e) => {
        const activeDrag = dragRef.current;
        if (
          activeDrag?.target &&
          !isSameStopPosition(activeDrag.stopId, activeDrag.target)
        ) {
          onMoveStop({ stopId: activeDrag.stopId, ...activeDrag.target });
        }
        if (activeDrag) suppressClick.current = activeDrag.stopId;
        reset(e);
      },
      onPointerCancel: reset,
      onClickCapture: (e: ReactMouseEvent<HTMLElement>) => {
        if (suppressClick.current !== stopId) return;
        suppressClick.current = null;
        e.preventDefault();
        e.stopPropagation();
      },
    }),
    [
      computeTarget,
      isSameStopPosition,
      onMoveStop,
      reset,
      setDragState,
      snapshotRects,
    ],
  );

  const stopStyle = useCallback(
    (stopId: string): CSSProperties | undefined =>
      drag?.stopId === stopId
        ? { transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0)` }
        : undefined,
    [drag],
  );

  const dropTarget =
    drag?.target && !isSameStopPosition(drag.stopId, drag.target)
      ? drag.target
      : null;

  const dropTargetSlot =
    dropTarget && drag
      ? {
          day: dropTarget.day,
          index: toDomInsertSlot(trip, drag.stopId, dropTarget),
        }
      : null;

  return {
    gridRef,
    registerColumn,
    registerStop,
    handleProps,
    stopStyle,
    draggedStopId: drag?.stopId ?? null,
    active: drag != null,
    dropTargetSlot,
  };
}

function closestStopColumn(
  columns: StopColumnRect[],
  x: number,
): StopColumnRect | null {
  let closest = columns[0] ?? null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const column of columns) {
    if (x >= column.left && x <= column.right) return column;
    const center = (column.left + column.right) / 2;
    const distance = Math.abs(center - x);
    if (distance < closestDistance) {
      closest = column;
      closestDistance = distance;
    }
  }
  return closest;
}

/** Map a post-removal insert index to the DOM `InsertTrigger` slot for that day.
 * While a card is lifted, the trigger elements keep their original indices. */
function toDomInsertSlot(
  trip: Trip,
  draggedStopId: string,
  target: StopMoveTarget,
): number {
  const source = trip.stops.find((s) => s.id === draggedStopId);
  if (!source || source.day !== target.day) return target.index;

  const dayStops = trip.stops.filter((s) => s.day === target.day);
  const sourceIndex = dayStops.findIndex((s) => s.id === draggedStopId);
  if (sourceIndex < 0) return target.index;

  return target.index <= sourceIndex ? target.index : target.index + 1;
}

/** New day-number order after moving `index` to post-removal `targetIndex`. */
function nextOrder(
  numbers: number[],
  index: number,
  targetIndex: number,
): number[] {
  const rest = numbers.filter((_, i) => i !== index);
  rest.splice(targetIndex, 0, numbers[index]!);
  return rest;
}

function sameOrder(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/** Horizontal preview offset for a non-dragged column while another day is
 * being inserted elsewhere. The DOM order stays stable until drop; transforms
 * make neighboring columns visibly make room. */
function previewOffsetX(
  numbers: number[],
  rects: ColumnRect[],
  index: number,
  drag: DragState,
): number {
  const dayNumber = numbers[index];
  if (dayNumber == null || index === drag.index) return 0;
  const order = nextOrder(numbers, drag.index, drag.targetIndex);
  const nextIndex = order.indexOf(dayNumber);
  const from = rects[index];
  const to = rects[nextIndex];
  if (nextIndex < 0 || !from || !to) return 0;
  return to.left - from.left;
}

/** Pixel x (grid-content coords) of the insertion line between the columns
 * that stay in place. Returns null when there is nothing to show. */
function insertionLineX(
  rects: ColumnRect[],
  draggedIndex: number,
  targetIndex: number,
): number | null {
  const remaining = rects.filter((_, i) => i !== draggedIndex);
  if (remaining.length === 0) return null;
  const gap =
    rects.length > 1 ? Math.max(0, rects[1]!.left - rects[0]!.right) : 14;
  if (targetIndex <= 0) return remaining[0]!.left - gap / 2;
  if (targetIndex >= remaining.length) {
    return remaining[remaining.length - 1]!.right + gap / 2;
  }
  return (remaining[targetIndex - 1]!.right + remaining[targetIndex]!.left) / 2;
}

function DayHeader({
  trip,
  day,
  headerMeta,
  suggestedCity,
  saving,
  deleting,
  dragging,
  dragHandleProps,
  onEdit,
  onDelete,
  onUseSuggestedCity,
}: {
  trip: Trip;
  day: TripDay;
  headerMeta: string;
  suggestedCity: string;
  saving: boolean;
  deleting: boolean;
  dragging: boolean;
  dragHandleProps: DayDragHandleProps;
  onEdit: () => void;
  onDelete: () => void;
  onUseSuggestedCity: () => void;
}) {
  const { t } = useTranslation("planner");
  return (
    <ContextMenu>
      <ContextMenuTrigger className="block">
        <div
          {...dragHandleProps}
          data-drag-handle=""
          aria-label={t("schedule.reorderAria", { n: day.number })}
          className={cn(
            "flex touch-none flex-col gap-0.5 rounded-xl border border-border bg-card p-2.5 shadow-xs",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="size-2.5 flex-none rounded-full"
              style={{ background: day.color }}
            />
            <span className="font-heading text-base font-semibold text-balance">
              {t("days.day", { n: day.number })}
            </span>
            <DayWeatherIcon trip={trip} dayNumber={day.number} />
          </div>
          {headerMeta ? (
            <span className="pl-4 font-mono text-[11px] text-muted-foreground tabular-nums">
              {headerMeta}
            </span>
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuPopup>
        <ContextMenuGroup>
          <ContextMenuGroupLabel>
            {t("schedule.dayMenu.label", { n: day.number })}
          </ContextMenuGroupLabel>
          <ContextMenuItem closeOnClick onClick={onEdit}>
            {t("schedule.dayMenu.edit")}
          </ContextMenuItem>
          <ContextMenuItem
            closeOnClick
            variant="destructive"
            disabled={deleting}
            onClick={onDelete}
          >
            {t("schedule.dayMenu.delete")}
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem
            closeOnClick
            disabled={!suggestedCity || saving}
            onClick={onUseSuggestedCity}
          >
            {t("schedule.dayMenu.useGeneratedLocation")}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuPopup>
    </ContextMenu>
  );
}

function DayEditorDialog({
  trip,
  day,
  suggestedCity,
  locationOptions,
  saving,
  onOpenChange,
  onSubmit,
}: {
  trip: Trip;
  day: TripDay | null;
  suggestedCity: string;
  locationOptions: string[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (dayNumber: number, patch: UpdateTripDayInput) => void;
}) {
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const [date, setDate] = useState("");
  const [city, setCity] = useState("");
  const [color, setColor] = useState(day?.color ?? DEFAULT_DAY_COLOR_PRESETS[0]!);
  const cityOptions = includeOption(locationOptions, city, suggestedCity);

  useEffect(() => {
    setDate(day ? dayIsoValue(trip, day) : "");
    setCity(day?.city ?? "");
    setColor(day?.color ?? DEFAULT_DAY_COLOR_PRESETS[0]!);
  }, [day?.number, trip]);

  const submit = () => {
    if (!day) return;
    const patch: UpdateTripDayInput = { date, dateLabel: "", city };
    if (color !== day.color) patch.color = color;
    onSubmit(day.number, patch);
  };

  return (
    <Dialog open={day != null} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity] duration-[var(--dur-slow)] data-[ending-style]:opacity-0" />
        <DialogViewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 md:p-6">
          <DialogPopup className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-border),var(--shadow-lg)] outline-none transition-[opacity,scale] duration-[var(--dur-slow)] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
            <DialogHeader>
              <DialogTitle className="m-0 font-heading text-xl font-semibold text-foreground">
                {day ? t("schedule.dayDialog.title", { n: day.number }) : ""}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {t("schedule.dayDialog.description")}
              </DialogDescription>
            </DialogHeader>

            <DialogPanel className="flex flex-col gap-4 pb-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                {t("schedule.dayDialog.date")}
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                {t("schedule.dayDialog.cityLabel")}
                <Select
                  items={cityOptions.map((value) => ({ value, label: value }))}
                  value={city || null}
                  onValueChange={(value) => setCity((value as string) ?? "")}
                >
                  <SelectTrigger aria-label={t("schedule.dayDialog.cityLabel")}>
                    <SelectValue
                      placeholder={t("schedule.dayDialog.cityPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectPopup>
                    {cityOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t("schedule.dayDialog.colorLabel")}
                </span>
                <DayColorPickerContent value={color} onChange={setColor} />
              </div>

              {suggestedCity ? (
                <button
                  type="button"
                  onClick={() => setCity(suggestedCity)}
                  className="w-fit rounded-md px-1.5 py-1 text-left text-xs font-medium text-corn-600 transition-[background-color,color,scale] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-accent hover:text-corn-700 active:scale-[var(--press-scale)]"
                >
                  {t("schedule.dayDialog.useGenerated", {
                    location: suggestedCity,
                  })}
                </button>
              ) : null}
            </DialogPanel>

            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {tc("actions.cancel")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={saving}
                onClick={submit}
              >
                {t("schedule.dayDialog.save")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

function DeleteDayDialog({
  day,
  deletingDayNumber,
  onOpenChange,
  onConfirm,
}: {
  day: TripDay | null;
  deletingDayNumber: number | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dayNumber: number) => void;
}) {
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const open = day != null;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-xl font-semibold text-foreground">
            {day ? t("schedule.deleteDialog.title", { n: day.number }) : ""}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            {t("schedule.deleteDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" size="sm" />}>
            {tc("actions.cancel")}
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" size="sm" />}
            onClick={() => {
              if (deletingDayNumber != null) onConfirm(deletingDayNumber);
            }}
          >
            {t("schedule.deleteDialog.confirm")}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayIsoValue(trip: Trip, day: TripDay): string {
  if (ISO_DATE.test(day.date)) return day.date;
  if (!ISO_DATE.test(trip.startDate)) return "";
  return addDaysIso(trip.startDate, day.number - 1);
}

function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function buildLocationOptions(trip: Trip): string[] {
  const values = [
    ...trip.days.map((day) => day.city),
    ...trip.days.map((day) =>
      inferDayLocation(trip.stops.filter((stop) => stop.day === day.number)),
    ),
    ...trip.stops.map((stop) => cityFromCoordinates(stop.lat, stop.lng) ?? ""),
    ...trip.stops.map((stop) => normalizeKnownPlace(stop.area) ?? ""),
  ];
  return uniqueOptions(values);
}

function includeOption(options: string[], ...values: string[]): string[] {
  return uniqueOptions([...values, ...options]);
}

function uniqueOptions(values: readonly string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function inferDayLocation(stops: readonly Stop[]): string {
  if (stops.length === 0) return "";

  const dominantCity = mostFrequent(
    stops
      .filter((stop) => !stop.transit)
      .map((stop) => cityFromCoordinates(stop.lat, stop.lng))
      .filter((city): city is string => city != null),
  );

  const routeParts = stops
    .map((stop) => splitRouteArea(stop.area))
    .find((parts): parts is [string, string] => parts != null);
  if (routeParts) {
    const [origin, destination] = routeParts;
    const routeDestination =
      dominantCity || normalizeKnownPlace(destination) || destination;
    if (origin && routeDestination && origin !== routeDestination) {
      return `${origin} → ${routeDestination}`;
    }
  }

  if (dominantCity) return dominantCity;

  return (
    mostFrequent(
      stops
        .map((stop) => normalizeAreaLabel(stop.area))
        .filter((area) => area.length > 0),
    ) ?? ""
  );
}

function cityFromCoordinates(lat: number, lng: number): string | null {
  if (lat >= 35.5 && lat <= 35.85 && lng >= 139.45 && lng <= 140.0) {
    return "Tokyo";
  }
  if (lat >= 34.85 && lat <= 35.15 && lng >= 135.55 && lng <= 135.9) {
    return "Kyoto";
  }
  if (lat >= 34.55 && lat <= 34.85 && lng >= 135.35 && lng <= 135.65) {
    return "Osaka";
  }
  return null;
}

function splitRouteArea(area: string): [string, string] | null {
  const [rawOrigin, rawDestination] = area.split(/\s*(?:→|->)\s*/);
  if (!rawOrigin || !rawDestination) return null;
  const origin = normalizeKnownPlace(rawOrigin) || normalizeAreaLabel(rawOrigin);
  const destination =
    normalizeKnownPlace(rawDestination) || normalizeAreaLabel(rawDestination);
  return origin && destination ? [origin, destination] : null;
}

function normalizeKnownPlace(value: string): string | null {
  const normalized = value.toLowerCase();
  if (normalized.includes("tokyo")) return "Tokyo";
  if (normalized.includes("kyoto")) return "Kyoto";
  if (normalized.includes("osaka") || normalized.includes("umeda")) {
    return "Osaka";
  }
  return null;
}

function normalizeAreaLabel(value: string): string {
  return value
    .replace(/\b(?:sta\.?|station)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mostFrequent(values: readonly string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]![0];
}

function InsertTrigger({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-4 items-center transition-opacity duration-150",
        active
          ? "pointer-events-none opacity-100"
          : "opacity-0 hover:opacity-100 focus-visible:opacity-100",
      )}
      aria-label={label}
    >
      <span className="h-0.5 flex-1 rounded-[1px] bg-corn-300" />
      <span className="mx-1 flex size-[18px] flex-none items-center justify-center rounded-full bg-brand text-white shadow-xs">
        <svg
          viewBox="0 0 24 24"
          className="size-[11px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </span>
      <span className="h-0.5 flex-1 rounded-[1px] bg-corn-300" />
    </button>
  );
}

function InsertComposer({
  compose,
  biasLat,
  biasLng,
  defaultCurrency,
  onChange,
  onConfirm,
  onCancel,
  onPickOnMap,
}: {
  compose: ComposeDraft;
  biasLat?: number;
  biasLng?: number;
  defaultCurrency: string;
  onChange: (patch: Partial<ComposeDraft>) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onPickOnMap: () => void;
}) {
  const { t, i18n } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const locale = i18n.resolvedLanguage ?? "en";
  const located = compose.lat != null && compose.lng != null;
  const hasOptions =
    compose.category != null ||
    compose.cost != null ||
    !!compose.note ||
    !!compose.duration ||
    !!compose.area;
  const [expanded, setExpanded] = useState(hasOptions);

  return (
    // Concentric radius: rounded-lg (10px) fields + 10px padding = 20px shell.
    // `my-2` gives the open composer breathing room from the cards above and
    // below (the collapsed insert triggers are flush by design).
    <div className="wf-enter my-2 flex flex-col gap-2 rounded-[20px] border border-corn-300 bg-card p-2.5 shadow-sm">
      <PlaceSearch
        autoFocus
        value={compose.name}
        biasLat={biasLat}
        biasLng={biasLng}
        placeholder={t("schedule.namePlaceholder")}
        onValueChange={(name) =>
          onChange({ name, lat: undefined, lng: undefined, area: undefined })
        }
        onSelectPlace={(p: PlaceResult) =>
          onChange({
            name: p.label,
            lat: p.lat,
            lng: p.lng,
            area: p.secondary || undefined,
          })
        }
        onPickOnMap={onPickOnMap}
        onSubmit={onConfirm}
        onCancel={onCancel}
      />
      <Select
        items={TIME_OPTIONS}
        value={compose.time || null}
        onValueChange={(value) => onChange({ time: (value as string) ?? "" })}
      >
        <SelectTrigger
          className="rounded-lg tabular-nums"
          aria-label={t("schedule.timePlaceholder")}
        >
          <SelectValue placeholder={t("schedule.timePlaceholder")} />
        </SelectTrigger>
        <SelectPopup>
          {TIME_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="relative flex h-8 w-fit items-center gap-1 rounded-md pl-1.5 pr-2 text-xs font-medium text-muted-foreground transition-[color,scale] duration-[var(--dur-fast)] ease-[var(--ease-out)] after:absolute after:-inset-1 after:content-[''] hover:text-foreground active:scale-[var(--press-scale)]"
      >
        <svg
          viewBox="0 0 24 24"
          className={cn(
            "size-3.5 transition-[rotate] duration-150",
            expanded && "rotate-90",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {t("schedule.moreOptions")}
      </button>

      {expanded ? (
        <div className="wf-enter flex flex-col gap-2">
          <Select
            items={CATEGORY_OPTIONS.map((c) => ({
              value: c,
              label: t(`category.${c}`),
            }))}
            value={compose.category ?? null}
            onValueChange={(value) =>
              onChange({ category: (value as StopCategory) ?? undefined })
            }
          >
            <SelectTrigger
              className="rounded-lg"
              aria-label={t("schedule.categoryPlaceholder")}
            >
              <SelectValue placeholder={t("schedule.categoryPlaceholder")}>
                {(value: StopCategory | null) =>
                  value ? (
                    <span className="flex items-center gap-2">
                      <CategoryIcon category={value} />
                      {t(`category.${value}`)}
                    </span>
                  ) : (
                    t("schedule.categoryPlaceholder")
                  )
                }
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="flex items-center gap-2">
                    <CategoryIcon category={c} />
                    {t(`category.${c}`)}
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>

          <Select
            items={DURATION_OPTIONS.map((d) => ({ value: d, label: d }))}
            value={compose.duration ?? null}
            onValueChange={(value) =>
              onChange({ duration: (value as string) ?? undefined })
            }
          >
            <SelectTrigger
              className="rounded-lg tabular-nums"
              aria-label={t("schedule.durationPlaceholder")}
            >
              <SelectValue placeholder={t("schedule.durationPlaceholder")} />
            </SelectTrigger>
            <SelectPopup>
              {DURATION_OPTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>

          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              value={compose.cost ?? ""}
              onChange={(e) =>
                onChange({
                  cost:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              placeholder={t("schedule.costPlaceholder")}
              className="min-w-0 flex-1 rounded-lg tabular-nums"
            />
            <Select
              items={currencySelectItems(locale)}
              value={compose.costCurrency ?? defaultCurrency}
              onValueChange={(value) =>
                onChange({ costCurrency: (value as string) ?? defaultCurrency })
              }
            >
              <SelectTrigger
                className={`${currencySelectTriggerClass} rounded-lg`}
                aria-label={t("schedule.currencyLabel")}
              >
                <SelectValue className={currencySelectValueClass}>
                  {(selected: string | null) =>
                    selected ? (
                      <CurrencyLabel code={selected} locale={locale} />
                    ) : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup className={currencySelectPopupClass}>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    <CurrencyLabel code={c} locale={locale} />
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          <Textarea
            value={compose.note ?? ""}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder={t("schedule.notePlaceholder")}
            rows={3}
            className="rounded-lg"
          />

          {located ? (
            <span
              className="ml-auto flex items-center gap-1 text-xs font-medium text-corn-600"
              title={compose.area}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {t("pick.located")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="flex-1"
        >
          {tc("actions.cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onConfirm}
          className="flex-1"
        >
          {t("schedule.add")}
        </Button>
      </div>
    </div>
  );
}
