import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import { dayColor } from "@/entities/trip";
import { TripMap, type MapStop } from "@/shared/ui/map";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";

export function TripMapView({
  trip,
  numbers,
  day,
  activeStopId,
  onSelectStop,
  picking = false,
  onPick,
  onCancelPick,
  onAddStopHere,
}: {
  trip: Trip;
  numbers: Map<string, number>;
  day: number;
  activeStopId: string | null;
  onSelectStop: (id: string) => void;
  picking?: boolean;
  onPick?: (lng: number, lat: number) => void;
  onCancelPick?: () => void;
  onAddStopHere?: (lng: number, lat: number) => void;
}) {
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const lastCoord = useRef<{ lng: number; lat: number } | null>(null);

  const copyCoords = () => {
    const c = lastCoord.current;
    if (!c) return;
    void navigator.clipboard?.writeText(
      `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`,
    );
  };

  const stops = useMemo<MapStop[]>(
    () =>
      trip.stops.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        day: s.day,
        color: dayColor(trip, s.day),
        num: numbers.get(s.id) ?? 0,
        transit: s.transit,
      })),
    [trip, numbers],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger className="relative block size-full">
        <TripMap
          stops={stops}
          day={day}
          activeStopId={activeStopId}
          onSelectStop={onSelectStop}
          unavailableLabel={tc("state.error")}
          picking={picking}
          onPick={onPick}
          onContext={(lng, lat) => {
            lastCoord.current = { lng, lat };
          }}
        />
      {picking ? (
        <div className="absolute inset-x-0 top-4 flex justify-center px-4">
          <div className="wf-enter flex items-center gap-3 rounded-full bg-card/95 py-3 pl-4 pr-2 text-sm shadow-[var(--shadow-border),var(--shadow-md)] backdrop-blur-sm">
            <span className="text-pretty font-medium">{t("pick.hint")}</span>
            <button
              type="button"
              onClick={onCancelPick}
              className="h-10 rounded-full px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,scale] hover:bg-accent hover:text-foreground active:scale-[0.96]"
            >
              {tc("actions.cancel")}
            </button>
          </div>
        </div>
      ) : null}
      {day === 0 ? (
        <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-xl bg-card/90 p-3 shadow-[var(--shadow-border),var(--shadow-md)] backdrop-blur-sm">
          {trip.days.map((d) => (
            <div key={d.number} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 flex-none rounded-full"
                style={{ background: d.color }}
              />
              <span className="font-medium">
                {t("days.day", { n: d.number })}
              </span>
              <span className="text-pretty text-muted-foreground">{d.city}</span>
            </div>
          ))}
        </div>
      ) : null}
      </ContextMenuTrigger>
      <ContextMenuPopup>
        <ContextMenuItem
          closeOnClick
          disabled={picking}
          onClick={() => {
            const c = lastCoord.current;
            if (c) onAddStopHere?.(c.lng, c.lat);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {t("map.menu.addStop")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem closeOnClick onClick={copyCoords}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {t("map.menu.copyCoords")}
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
}
