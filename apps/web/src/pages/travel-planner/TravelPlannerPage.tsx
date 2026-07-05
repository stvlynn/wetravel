import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTrip, renameTrip, reversePlace } from "@/shared/api";
import { queryKeys } from "@/shared/config";
import { stopNumbers } from "@/entities/trip";
import type { Trip } from "@/entities/trip";
import { useRouter } from "@/app/router";
import { useSession } from "@/shared/auth";
import { cn, useEnterOnUpdate } from "@/shared/lib";
import { AppSidebar } from "@/widgets/app-sidebar";
import { Spinner } from "@/shared/ui/spinner";
import { Tabs } from "@/shared/ui/tabs";
import { useTripActions } from "./model/useTripActions";
import { Sidebar } from "./ui/Sidebar";
import { TripMapView } from "./ui/TripMapView";
import { ScheduleBoard, type ComposeDraft } from "./ui/ScheduleBoard";
import { BudgetBoard } from "./ui/BudgetBoard";
import { FloatingMembers } from "./ui/FloatingMembers";

type Tab = "map" | "schedule" | "budget";

export function TravelPlannerPage({ tripId }: { tripId: string }) {
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const { navigate } = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "lynn";
  const preferredCurrency = session?.user?.defaultCurrency;

  const { i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("map");
  const [day, setDay] = useState(0);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [compose, setCompose] = useState<ComposeDraft | null>(null);
  const [picking, setPicking] = useState(false);

  const queryClient = useQueryClient();
  const { data: trip, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: () => fetchTrip(tripId),
  });
  const actions = useTripActions(tripId);

  const rename = useMutation({
    mutationFn: (title: string) => renameTrip(tripId, title),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.trips });
    },
  });

  const numbers = useMemo(
    () => (trip ? stopNumbers(trip.stops) : new Map<string, number>()),
    [trip],
  );
  const tabEnter = useEnterOnUpdate(tab);

  // Bias place search toward the trip's existing footprint for local relevance.
  const bias = useMemo(() => {
    const first = trip?.stops?.[0];
    return first ? { lat: first.lat, lng: first.lng } : undefined;
  }, [trip]);

  const openCompose = (d: number, index: number) =>
    setCompose({
      day: d,
      index,
      name: "",
      time: "",
      costCurrency: preferredCurrency || trip?.currency,
    });
  const patchCompose = (patch: Partial<ComposeDraft>) =>
    setCompose((c) => (c ? { ...c, ...patch } : c));
  const cancelCompose = () => {
    setCompose(null);
    setPicking(false);
  };
  const confirmCompose = () => {
    setCompose((c) => {
      const name = c?.name.trim();
      if (c && name) {
        actions.stop.mutate({
          day: c.day,
          index: c.index,
          name,
          time: c.time.trim(),
          lat: c.lat,
          lng: c.lng,
          area: c.area,
          category: c.category,
          cost: c.cost,
          costCurrency: c.costCurrency,
          note: c.note?.trim() || undefined,
        });
      }
      return null;
    });
    setPicking(false);
  };
  const startPickOnMap = () => {
    if (!compose) return;
    setPicking(true);
    setTab("map");
  };
  const handleMapPick = async (lng: number, lat: number) => {
    setPicking(false);
    setTab("schedule");
    let name: string | undefined;
    let area: string | undefined;
    try {
      const place = await reversePlace(lat, lng, i18n.resolvedLanguage ?? "en");
      if (place) {
        name = place.label;
        area = place.secondary || undefined;
      }
    } catch {
      // Reverse geocoding is best-effort; keep any name the user already typed.
    }
    setCompose((c) =>
      c ? { ...c, lat, lng, name: c.name.trim() || name || c.name, area } : c,
    );
  };
  // Right-click "Add a stop here": open the composer pre-filled at the clicked point.
  const addStopAt = async (lng: number, lat: number) => {
    if (!trip) return;
    const targetDay = day > 0 ? day : (trip.days[0]?.number ?? 1);
    const index = trip.stops.filter((s) => s.day === targetDay).length;
    setCompose({
      day: targetDay,
      index,
      name: "",
      time: "",
      lat,
      lng,
      costCurrency: preferredCurrency || trip.currency,
    });
    setPicking(false);
    setTab("schedule");
    try {
      const place = await reversePlace(lat, lng, i18n.resolvedLanguage ?? "en");
      if (place) {
        setCompose((c) =>
          c
            ? {
                ...c,
                name: c.name.trim() || place.label,
                area: place.secondary || undefined,
              }
            : c,
        );
      }
    } catch {
      // Reverse geocoding is best-effort; the user can still type a name.
    }
  };

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="wf-enter">
          <Spinner className="size-6" />
        </div>
      </div>
    );
  }

  if (isError || !trip) {
    return (
      <div className="flex h-dvh bg-sidebar">
        <AppSidebar top={<BackButton onBack={() => navigate("/")} />} />
        <div className="wf-enter flex flex-1 flex-col items-center justify-center gap-3 rounded-l-2xl border border-r-0 border-border bg-background">
          <p className="text-sm text-pretty text-muted-foreground">{tc("state.error")}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex h-10 items-center justify-center px-2 text-sm text-corn-600 transition-[color,scale] duration-150 hover:underline active:scale-[0.96]"
          >
            {tc("state.retry")}
          </button>
        </div>
      </div>
    );
  }

  const tabItems = [
    { value: "map", label: t("tabs.map") },
    { value: "schedule", label: t("tabs.schedule") },
    { value: "budget", label: t("tabs.budget") },
  ];

  const selectStop = (id: string) => {
    setSelectedStopId(id);
  };

  const headerSubtitle = formatTripSubtitle(trip, i18n.language, t);

  return (
    <div className="flex h-dvh bg-sidebar">
      <AppSidebar
        top={
          <div className="flex flex-col gap-2">
            <BackButton
              onBack={() => navigate("/")}
              title={trip.title}
              subtitle={headerSubtitle}
              onRename={(title) => rename.mutate(title)}
            />
            <div className="px-1 pb-1 pt-2">
              <Tabs
                items={tabItems}
                value={tab}
                onValueChange={(v) => setTab(v as Tab)}
                aria-label={t("tabs.map")}
                className="flex w-full"
              />
            </div>
          </div>
        }
      >
        <Sidebar
          trip={trip}
          numbers={numbers}
          day={day}
          onDayChange={(d) => {
            setDay(d);
            setSelectedStopId(null);
          }}
          selectedStopId={selectedStopId}
          onSelectStop={selectStop}
          onCloseDetail={() => setSelectedStopId(null)}
          currentUserId={currentUserId}
          onToggleVote={(stopId) => actions.vote.mutate(stopId)}
          onComment={(stopId, text) =>
            actions.comment.mutate({ stopId, text })
          }
          commentPending={actions.comment.isPending}
        />
      </AppSidebar>

      <div className="flex min-w-0 flex-1 overflow-hidden rounded-l-2xl border border-r-0 border-border bg-background shadow-[-8px_0_24px_-16px_rgba(15,23,42,0.25)]">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div
            key={tab}
            className={cn(
              "relative min-h-0 flex-1 overflow-auto",
              tabEnter && "wf-enter",
            )}
          >
            {tab === "map" ? (
              <TripMapView
                trip={trip}
                numbers={numbers}
                day={day}
                activeStopId={selectedStopId}
                onSelectStop={selectStop}
                picking={picking}
                onPick={handleMapPick}
                onAddStopHere={addStopAt}
                onCancelPick={() => {
                  setPicking(false);
                  setTab("schedule");
                }}
              />
            ) : tab === "schedule" ? (
              <ScheduleBoard
                trip={trip}
                compose={compose}
                defaultCurrency={preferredCurrency || trip.currency}
                biasLat={bias?.lat}
                biasLng={bias?.lng}
                onOpen={openCompose}
                onChange={patchCompose}
                onConfirm={confirmCompose}
                onCancel={cancelCompose}
                onPickOnMap={startPickOnMap}
                onSelectStop={(id) => {
                  setTab("map");
                  setDay(0);
                  selectStop(id);
                }}
                onAddDay={() => actions.day.mutate()}
                addingDay={actions.day.isPending}
              />
            ) : (
              <BudgetBoard
                trip={trip}
                currentUserId={currentUserId}
                defaultCurrency={preferredCurrency || trip.currency}
                onAddExpense={(input) => actions.expense.mutate(input)}
              />
            )}
          </div>

          <FloatingMembers members={trip.members} />
        </main>
      </div>
    </div>
  );
}

function BackButton({
  onBack,
  title,
  subtitle,
  onRename,
}: {
  onBack: () => void;
  title?: string;
  subtitle?: string;
  onRename?: (title: string) => void;
}) {
  const { t } = useTranslation("common");
  const { t: tp } = useTranslation("planner");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title ?? "");

  useEffect(() => setValue(title ?? ""), [title]);

  const commit = () => {
    setEditing(false);
    const next = value.trim();
    if (next && next !== title) onRename?.(next);
    else setValue(title ?? "");
  };

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <button
        type="button"
        onClick={onBack}
        aria-label={t("actions.back")}
        title={t("actions.back")}
        className="relative inline-flex size-8 flex-none items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,scale] duration-150 after:absolute after:-inset-1 after:content-[''] hover:bg-accent hover:text-foreground active:scale-[0.96]"
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
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      {title == null ? null : editing ? (
        <input
          autoFocus
          value={value}
          maxLength={120}
          aria-label={tp("header.renameAria")}
          placeholder={tp("header.renamePlaceholder")}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setValue(title);
              setEditing(false);
            }
          }}
          className="min-h-8 w-full rounded-md border border-ring bg-background px-1.5 py-1 font-heading text-base font-semibold outline-none"
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
          <button
            type="button"
            onClick={() => onRename && setEditing(true)}
            title={onRename ? tp("header.renameAria") : title}
            className="truncate text-left font-heading text-base font-semibold leading-tight tracking-tight transition-[background-color,color,scale] duration-100 hover:text-corn-600 active:scale-[0.96]"
          >
            {title}
          </button>
          {subtitle ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">
              {subtitle}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatTripSubtitle(
  trip: Trip,
  locale: string,
  t: TFunction<"planner">,
): string {
  const dayCount = trip.days.length;
  const stopCount = trip.stops.length;

  let startLabel = "";
  let endLabel = "";

  if (ISO_DATE.test(trip.startDate) && dayCount > 0) {
    const [y, m, d] = trip.startDate.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const start = new Date(Date.UTC(y, m - 1, d));
    const end = new Date(Date.UTC(y, m - 1, d + dayCount - 1));
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const fmt = (date: Date, withYear: boolean) =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: withYear ? "numeric" : undefined,
        timeZone: "UTC",
      }).format(date);
    startLabel = fmt(start, !sameYear);
    endLabel = fmt(end, true);
  }

  return t("header.subtitle", {
    start: startLabel,
    end: endLabel,
    days: dayCount,
    stops: stopCount,
  });
}
