import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  CloudSunIcon,
  LocateFixedIcon,
  MapPinIcon,
  PencilIcon,
  SearchIcon,
} from "lucide-react";
import { fetchWeather, searchPlaces, type PlaceResult } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

const STORAGE_PREFIX = "opentrip.today-place.v1";

function storageKey(userId: string | undefined): string {
  return `${STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

function loadPlace(userId: string | undefined): PlaceResult | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PlaceResult>;
    return typeof value.label === "string" &&
      typeof value.lat === "number" &&
      typeof value.lng === "number"
      ? {
          id: value.id ?? "saved",
          label: value.label,
          secondary: value.secondary ?? "",
          lat: value.lat,
          lng: value.lng,
        }
      : null;
  } catch {
    return null;
  }
}

export function TodayPlaceCard({
  userId,
  locale,
}: {
  userId: string | undefined;
  locale: string;
}) {
  const { t, i18n } = useTranslation("trips");
  const [place, setPlace] = useState<PlaceResult | null>(() =>
    loadPlace(userId),
  );
  const [editing, setEditing] = useState(!place);
  const [query, setQuery] = useState(place?.label ?? "");
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const weather = useQuery({
    queryKey: ["today-weather", place?.lat, place?.lng, locale],
    queryFn: () =>
      fetchWeather(place!.lat, place!.lng, undefined, undefined, {
        lang: i18n.resolvedLanguage ?? i18n.language,
      }),
    enabled: Boolean(place),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  async function findPlace(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    setMessage("");
    try {
      const [result] = await searchPlaces(query, {
        lang: i18n.resolvedLanguage ?? i18n.language,
        limit: 1,
      });
      if (!result) {
        setMessage(t("today.place.notFound"));
        return;
      }
      setPlace(result);
      setQuery(result.label);
      setEditing(false);
      localStorage.setItem(storageKey(userId), JSON.stringify(result));
    } catch {
      setMessage(t("today.place.failed"));
    } finally {
      setSearching(false);
    }
  }

  const temperature =
    weather.data?.temp == null
      ? null
      : new Intl.NumberFormat(locale, {
          style: "unit",
          unit: "celsius",
          maximumFractionDigits: 0,
        }).format(weather.data.temp);

  return (
    <Card className="flex min-h-60 flex-col overflow-hidden border border-border p-5 shadow-[var(--shadow-border)] md:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-muted text-corn-600">
          {place ? (
            <MapPinIcon className="size-5" aria-hidden="true" />
          ) : (
            <LocateFixedIcon className="size-5" aria-hidden="true" />
          )}
        </span>
        {place && !editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <PencilIcon aria-hidden="true" />
            {t("today.place.change")}
          </Button>
        ) : null}
      </div>

      {place && !editing ? (
        <>
          <p className="mt-6 text-xs font-medium text-muted-foreground">
            {t("today.place.label")}
          </p>
          <h2 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-balance">
            {place.label}
          </h2>
          {place.secondary ? (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {place.secondary}
            </p>
          ) : null}
          <div className="mt-auto flex items-end justify-between gap-4 pt-6">
            {weather.data ? (
              <div className="flex items-center gap-2">
                <CloudSunIcon className="size-5 text-corn-600" aria-hidden="true" />
                <span className="text-sm capitalize text-muted-foreground">
                  {weather.data.description}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {weather.isPending
                  ? t("today.place.weatherLoading")
                  : t("today.place.weatherUnavailable")}
              </span>
            )}
            {temperature ? (
              <span className="font-heading text-3xl font-semibold tabular-nums">
                {temperature}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-6 font-heading text-xl font-semibold text-balance">
            {t("today.place.emptyTitle")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">
            {t("today.place.emptyDescription")}
          </p>
          <form onSubmit={findPlace} className="mt-auto flex gap-2 pt-5">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("today.place.placeholder")}
              aria-label={t("today.place.inputLabel")}
              className="h-11 min-w-0 flex-1"
            />
            <Button
              type="submit"
              variant="brand"
              size="icon"
              disabled={!query.trim() || searching}
              aria-label={t("today.place.search")}
            >
              <SearchIcon aria-hidden="true" />
            </Button>
          </form>
          {message ? (
            <p className="mt-2 text-xs text-destructive">{message}</p>
          ) : null}
        </>
      )}
    </Card>
  );
}
