import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlaceResult } from "@/shared/api";
import type { Trip } from "@/entities/trip";
import { dayColor } from "@/entities/trip";
import { interactive } from "@/shared/lib";
import {
  TripMap,
  type MapStop,
  type SearchResult,
  type UserLocationAvatar,
} from "@/shared/ui/map";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { useDestinationMapCenter } from "../model/useDestinationMapCenter";
import { MapSearch } from "./MapSearch";

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
  locateSignal = 0,
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
  /** Increment to fly/start geolocation for the current user. */
  locateSignal?: number;
}) {
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const lastCoord = useRef<{ lng: number; lat: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const destinationCenter = useDestinationMapCenter(trip);

  const bias = useMemo(() => {
    const first = trip.stops[0];
    if (first) return { lat: first.lat, lng: first.lng };
    return destinationCenter ?? undefined;
  }, [trip, destinationCenter]);

  const userAvatar = useMemo<UserLocationAvatar | null>(() => {
    const me = trip.members.find((m) => m.isCurrentUser);
    if (!me) return null;
    return {
      name: me.name,
      bg: me.avatarBg,
      fg: me.avatarFg,
      src: me.image,
      seed: me.id,
    };
  }, [trip.members]);

  useEffect(() => {
    setSearchResult(null);
    setSearchQuery("");
  }, [activeStopId, day]);

  useEffect(() => {
    if (picking) {
      setSearchResult(null);
      setSearchQuery("");
    }
  }, [picking]);

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

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) setSearchResult(null);
  };

  const handleSelectPlace = (place: PlaceResult) => {
    setSearchQuery(place.label);
    setSearchResult({ lat: place.lat, lng: place.lng, name: place.label });
  };

  const handleAddSearchResult = () => {
    if (!searchResult) return;
    const { lng, lat } = searchResult;
    setSearchResult(null);
    setSearchQuery("");
    onAddStopHere?.(lng, lat);
  };

  return (
    <ContextMenu>
      {/* Below md the search bar spans the top edge (inset-x-3 top-3 + h-10
          input = 52px), so the map control stack starts below it. */}
      <ContextMenuTrigger className="relative block size-full max-md:[--map-ctrl-top-offset:52px]">
        {!picking ? (
          <div className="absolute inset-x-3 top-3 z-10 md:inset-x-auto md:left-4 md:top-4 md:w-full md:max-w-xs md:pr-8">
            <MapSearch
              value={searchQuery}
              onValueChange={handleSearchChange}
              onSelect={handleSelectPlace}
              placeholder={t("map.search.placeholder")}
              biasLat={bias?.lat}
              biasLng={bias?.lng}
            />
          </div>
        ) : null}
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
          searchResult={searchResult}
          onAddSearchResult={handleAddSearchResult}
          fallbackCenter={destinationCenter}
          userAvatar={userAvatar}
          locateSignal={locateSignal}
        />
        {picking ? (
          <div className="absolute inset-x-0 top-4 flex justify-center px-4">
            <div className="wf-enter flex items-center gap-3 rounded-full bg-card/95 py-3 pl-4 pr-2 text-sm shadow-[var(--shadow-border),var(--shadow-md)] backdrop-blur-sm">
              <span className="text-pretty font-medium">{t("pick.hint")}</span>
              <button
                type="button"
                onClick={onCancelPick}
                className={`h-10 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground ${interactive}`}
              >
                {tc("actions.cancel")}
              </button>
            </div>
          </div>
        ) : null}
        {day === 0 ? (
          <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-xl bg-card/90 p-3 shadow-[var(--shadow-border),var(--shadow-md)] backdrop-blur-sm max-md:hidden">
            {trip.days.map((d) => (
              <div key={d.number} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2.5 flex-none rounded-full"
                  style={{ background: d.color }}
                />
                <span className="font-medium">
                  {t("days.day", { n: d.number })}
                </span>
                <span className="text-pretty text-muted-foreground">
                  {d.city}
                </span>
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
