import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { searchPlaces, type PlaceResult } from "@/shared/api";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
  AutocompleteStatus,
} from "@/shared/ui/autocomplete";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export interface PlaceSearchProps {
  value: string;
  onValueChange: (text: string) => void;
  onSelectPlace: (place: PlaceResult) => void;
  onPickOnMap: () => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  placeholder: string;
  biasLat?: number;
  biasLng?: number;
  autoFocus?: boolean;
}

/** Stop-name field: geocoding autocomplete (Photon, relevance-sorted) plus a
 * "pick on map" affordance. Free text is allowed; picking a suggestion or a map
 * point attaches real coordinates. */
export function PlaceSearch({
  value,
  onValueChange,
  onSelectPlace,
  onPickOnMap,
  onSubmit,
  onCancel,
  placeholder,
  biasLat,
  biasLng,
  autoFocus,
}: PlaceSearchProps) {
  const { t, i18n } = useTranslation("planner");
  const lang = i18n.resolvedLanguage ?? "en";
  const debounced = useDebounced(value, 250);
  const enabled = debounced.trim().length >= 2;
  const [open, setOpen] = useState(false);
  const highlightedRef = useRef<PlaceResult | undefined>(undefined);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["places", debounced, biasLat, biasLng, lang],
    queryFn: ({ signal }) =>
      searchPlaces(debounced, { lat: biasLat, lng: biasLng, lang, signal }),
    enabled,
    staleTime: 60_000,
  });

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Autocomplete
          items={results}
          value={value}
          open={open}
          onOpenChange={setOpen}
          mode="none"
          itemToStringValue={(item: PlaceResult) => item.label}
          onItemHighlighted={(item) => {
            highlightedRef.current = item;
          }}
          onValueChange={(next, details) => {
            if (details.reason === "item-press") {
              const picked =
                highlightedRef.current ??
                results.find((r) => r.label === next);
              if (picked) onSelectPlace(picked);
              else onValueChange(next);
              setOpen(false);
            } else {
              onValueChange(next);
              setOpen(next.trim().length >= 2);
            }
          }}
        >
          <AutocompleteInput
            className="rounded-lg"
            autoFocus={autoFocus}
            placeholder={placeholder}
            showClear
            startAddon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !open) {
                e.preventDefault();
                onSubmit?.();
              }
              if (e.key === "Escape" && !open) onCancel?.();
            }}
          />
          <AutocompletePopup>
            {isFetching ? (
              <AutocompleteStatus>{t("pick.searching")}</AutocompleteStatus>
            ) : null}
            <AutocompleteEmpty>
              {enabled && !isFetching ? t("pick.noResults") : ""}
            </AutocompleteEmpty>
            <AutocompleteList>
              {(item: PlaceResult) => (
                <AutocompleteItem key={item.id} value={item}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{item.label}</span>
                    {item.secondary ? (
                      <span className="truncate text-xs text-muted-foreground text-pretty">
                        {item.secondary}
                      </span>
                    ) : null}
                  </span>
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </AutocompletePopup>
        </Autocomplete>
      </div>

      <button
        type="button"
        onClick={onPickOnMap}
        aria-label={t("pick.onMap")}
        title={t("pick.onMap")}
        className="flex size-10 flex-none items-center justify-center rounded-lg bg-card text-muted-foreground shadow-[var(--shadow-border)] transition-[background-color,box-shadow,color,scale] duration-150 hover:bg-accent hover:text-corn-600 hover:shadow-[var(--shadow-border-hover)] active:scale-[0.96]"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
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
      </button>
    </div>
  );
}
