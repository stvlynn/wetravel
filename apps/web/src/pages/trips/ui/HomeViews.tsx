import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CalendarClockIcon,
  CompassIcon,
  PenLineIcon,
  PlusIcon,
  RouteIcon,
} from "lucide-react";
import type { TripStatus, TripSummary } from "@/entities/trip";
import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Spinner } from "@/shared/ui/spinner";
import { Tabs } from "@/shared/ui/tabs";
import type { LocalJournalEntry } from "../model/local-journal";
import { JournalEntryCard } from "./JournalEntryCard";
import { TripCard } from "./TripCard";
import { TodayPlaceCard } from "./TodayPlaceCard";

interface TripsDataProps {
  trips: TripSummary[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpenTrip: (tripId: string) => void;
  onCreateTrip: () => void;
}

interface JournalDataProps {
  entries: LocalJournalEntry[];
  trips: TripSummary[];
  locale: string;
  onRecord: () => void;
  onOpenEntry?: (entryId: string) => void;
}

export function TodayView({
  trips,
  entries,
  locale,
  isPending,
  isError,
  onRetry,
  onOpenTrip,
  onCreateTrip,
  onRecord,
  onOpenEntry,
  userId,
}: TripsDataProps & JournalDataProps & { userId?: string }) {
  const { t } = useTranslation("trips");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const datedTrips = trips
    .map((trip) => ({
      trip,
      start: Date.parse(trip.startLabel),
      end: Date.parse(trip.endLabel),
    }))
    .filter(
      (
        value,
      ): value is { trip: TripSummary; start: number; end: number } =>
        Number.isFinite(value.start) && Number.isFinite(value.end),
    );
  const currentTrip = datedTrips.find(
    ({ start, end }) => start <= today.getTime() && end >= today.getTime(),
  )?.trip;
  const nextTrip = datedTrips
    .filter(({ start }) => start > today.getTime())
    .sort((left, right) => left.start - right.start)[0]?.trip;
  const reflectionWindowStart = today.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recentTrip = datedTrips
    .filter(
      ({ end }) =>
        end < today.getTime() && end >= reflectionWindowStart,
    )
    .sort((left, right) => right.end - left.end)[0]?.trip;
  const highlightedTrip = currentTrip ?? nextTrip;
  const focus = currentTrip
    ? "trip"
    : recentTrip
      ? "reflection"
      : nextTrip
        ? "prepare"
        : "home";
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <Surface>
      <PageHeader
        eyebrow={date}
        title={t("today.title")}
        subtitle={t("today.subtitle")}
        action={
          <Button variant="brand" size="lg" onClick={onRecord}>
            <PenLineIcon className="size-4" aria-hidden="true" />
            <span>{t("home.record")}</span>
          </Button>
        }
      />

      <section className="wf-enter-stagger grid gap-5 md:grid-cols-2">
        <TodayPlaceCard userId={userId} locale={locale} />

        <button
          type="button"
          onClick={onRecord}
          className="wf-enter wf-interactive wf-pressable flex min-h-60 w-full flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-[var(--shadow-border)] transition-[border-color,box-shadow,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:border-corn-300 hover:shadow-md [&:hover_.today-arrow]:translate-x-0.5 md:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-muted text-corn-600">
              <PenLineIcon className="size-5" aria-hidden="true" />
            </span>
            <ArrowRightIcon
              className="today-arrow size-4 text-muted-foreground transition-transform duration-150"
              aria-hidden="true"
            />
          </div>
          <span className="mt-6 font-heading text-xl font-semibold text-balance">
            {t("today.quickCapture.title")}
          </span>
          <span className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">
            {t("today.quickCapture.description")}
          </span>
          <span className="mt-auto pt-5 text-xs font-semibold text-corn-600">
            {t("today.quickCapture.action")}
          </span>
        </button>

        {isPending ? (
          <LoadingCard />
        ) : isError ? (
          <ErrorCard onRetry={onRetry} />
        ) : highlightedTrip ? (
          <TripCard
            trip={highlightedTrip}
            onOpen={() => onOpenTrip(highlightedTrip.id)}
          />
        ) : (
          <Card className="flex min-h-60 flex-col border border-border p-5 shadow-[var(--shadow-border)] md:p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <CalendarClockIcon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-6 font-heading text-xl font-semibold text-balance">
              {t("today.noTrip.title")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">
              {t("today.noTrip.description")}
            </p>
            <Button
              className="mt-auto w-fit"
              variant="outline"
              onClick={onCreateTrip}
            >
              <PlusIcon aria-hidden="true" />
              {t("today.noTrip.action")}
            </Button>
          </Card>
        )}

        <Card className="flex min-h-60 flex-col border border-border bg-[linear-gradient(145deg,var(--card),var(--brand-muted))] p-5 shadow-[var(--shadow-border)] md:p-6">
          <span className="flex size-11 items-center justify-center rounded-xl bg-card text-corn-600 shadow-[var(--shadow-border)]">
            <RouteIcon className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-6 font-heading text-xl font-semibold text-balance">
            {t(`today.focus.${focus}Title`)}
          </h2>
          <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">
            {t(`today.focus.${focus}Description`)}
          </p>
          <button
            type="button"
            onClick={() => {
              if (currentTrip) onOpenTrip(currentTrip.id);
              else if (focus === "prepare" && nextTrip) onOpenTrip(nextTrip.id);
              else onRecord();
            }}
            className="wf-interactive wf-pressable mt-auto inline-flex min-h-10 w-fit items-center gap-1.5 pt-4 text-sm font-semibold text-corn-600 hover:underline"
          >
            {t(`today.focus.${focus}Action`)}
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </button>
        </Card>
      </section>

      {entries.length > 0 ? (
        <section>
          <SectionLabel>{t("today.recentEntries")}</SectionLabel>
          <div className="grid gap-4 lg:grid-cols-2">
            {entries.slice(0, 2).map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                trip={trips.find((trip) => trip.id === entry.tripId)}
                locale={locale}
                onOpen={onOpenEntry ? () => onOpenEntry(entry.id) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}
    </Surface>
  );
}

type TripFilter = "all" | TripStatus;

export function TripsCollection({
  trips,
  isPending,
  isError,
  onRetry,
  onOpenTrip,
  onCreateTrip,
}: TripsDataProps) {
  const { t } = useTranslation("trips");
  const [filter, setFilter] = useState<TripFilter>("all");
  const filteredTrips = useMemo(
    () =>
      filter === "all"
        ? trips
        : trips.filter((trip) => trip.status === filter),
    [filter, trips],
  );
  const filters: TripFilter[] = ["all", "active", "planning", "settled"];

  return (
    <Surface>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button variant="brand" size="lg" onClick={onCreateTrip}>
            <PlusIcon className="size-4" aria-hidden="true" />
            <span>{t("newTrip")}</span>
          </Button>
        }
      />

      {!isPending && !isError && trips.length > 0 ? (
        <Tabs
          aria-label={t("filters.label")}
          value={filter}
          onValueChange={(value) => setFilter(value as TripFilter)}
          items={filters.map((value) => ({
            value,
            label: t(`filters.${value}`),
          }))}
        />
      ) : null}

      {isPending ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : isError ? (
        <ErrorCard onRetry={onRetry} />
      ) : trips.length === 0 ? (
        <TripsEmptyState onCreate={onCreateTrip} />
      ) : filteredTrips.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
          {t("filters.empty")}
        </div>
      ) : (
        <div className="wf-enter-stagger grid grid-cols-1 gap-5 md:grid-cols-2">
          {filteredTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onOpen={() => onOpenTrip(trip.id)}
            />
          ))}
        </div>
      )}
    </Surface>
  );
}

export function JournalCollection({
  entries,
  trips,
  locale,
  onRecord,
  onOpenEntry,
}: JournalDataProps) {
  const { t } = useTranslation("trips");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const filteredEntries =
    filter === "all"
      ? entries
      : entries.filter((entry) => entry.status === filter);
  return (
    <Surface>
      <PageHeader
        title={t("journal.title")}
        subtitle={t("journal.subtitle")}
        action={
          <Button variant="brand" size="lg" onClick={onRecord}>
            <PenLineIcon className="size-4" aria-hidden="true" />
            <span>{t("journal.newEntry")}</span>
          </Button>
        }
      />

      {entries.length ? (
        <Tabs
          aria-label={t("journal.filters.label")}
          value={filter}
          onValueChange={(value) =>
            setFilter(value as "all" | "published" | "draft")
          }
          items={(["all", "published", "draft"] as const).map((value) => ({
            value,
            label: t(`journal.filters.${value}`, {
              count:
                value === "all"
                  ? entries.length
                  : entries.filter((entry) => entry.status === value).length,
            }),
          }))}
        />
      ) : null}

      {entries.length === 0 ? (
        <Card className="flex min-h-80 flex-col items-center justify-center border border-dashed border-border p-8 text-center shadow-none">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-muted text-corn-600">
            <BookOpenTextIcon className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-5 font-heading text-xl font-semibold text-balance">
            {t("journal.empty.title")}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-pretty text-muted-foreground">
            {t("journal.empty.description")}
          </p>
          <Button className="mt-6" variant="outline" onClick={onRecord}>
            <PenLineIcon className="size-4" aria-hidden="true" />
            {t("journal.empty.action")}
          </Button>
        </Card>
      ) : filteredEntries.length === 0 ? (
        <Card className="flex min-h-52 flex-col items-center justify-center border border-dashed border-border p-8 text-center shadow-none">
          <BookOpenTextIcon className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">
            {t(`journal.filters.empty.${filter}`)}
          </p>
        </Card>
      ) : (
        <div className="wf-enter-stagger grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 xl:gap-x-8 xl:gap-y-12">
          {filteredEntries.map((entry) => (
            <JournalEntryCard
              key={entry.id}
              entry={entry}
              trip={trips.find((trip) => trip.id === entry.tripId)}
              locale={locale}
              onOpen={() => onOpenEntry?.(entry.id)}
            />
          ))}
        </div>
      )}
    </Surface>
  );
}

function Surface({
  children,
  narrow = false,
}: {
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-4 py-7 pb-28 md:px-8 md:py-12 md:pb-12",
        narrow ? "max-w-4xl" : "max-w-6xl",
      )}
    >
      {children}
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  action: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-5">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-heading text-3xl font-semibold tracking-[-0.025em] text-balance md:text-4xl">
          {title}
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-pretty text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <div className="flex-none max-sm:[&_button]:size-10 max-sm:[&_button]:px-0 max-sm:[&_button_span]:sr-only">
        {action}
      </div>
    </header>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function LoadingCard() {
  return (
    <Card className="flex min-h-64 items-center justify-center border border-border">
      <Spinner className="size-6" />
    </Card>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("common");
  return (
    <Card className="flex min-h-56 flex-col items-center justify-center gap-3 border border-border p-6">
      <p className="text-sm text-muted-foreground">{t("state.error")}</p>
      <Button variant="ghost" onClick={onRetry}>
        {t("state.retry")}
      </Button>
    </Card>
  );
}

function TripsEmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation("trips");
  return (
    <Card className="relative min-h-[420px] overflow-hidden border border-dashed border-border p-8">
      <div
        className="absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_50%_0%,var(--brand-muted),transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative flex min-h-[350px] flex-col items-center justify-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-muted text-corn-600">
          <CompassIcon className="size-7" aria-hidden="true" />
        </span>
        <h2 className="mt-5 font-heading text-xl font-semibold">
          {t("empty.title")}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-pretty text-muted-foreground">
          {t("empty.subtitle")}
        </p>
        <Button className="mt-6" variant="brand" onClick={onCreate}>
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("newTrip")}
        </Button>
      </div>
    </Card>
  );
}
