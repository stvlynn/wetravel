import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import { dayDateLabel } from "@/entities/trip";
import { CategoryIcon, type StopCategory } from "@/entities/stop";
import type { PlaceResult } from "@/shared/api";
import { cn, formatMoney, CURRENCIES } from "@/shared/lib";
import { Button } from "@/shared/ui/button";
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

const CATEGORY_OPTIONS: StopCategory[] = [
  "Sight",
  "Food",
  "Stay",
  "Shopping",
  "Activity",
  "Walk",
  "Park",
  "Transit",
  "Plan",
];

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

export interface ComposeDraft {
  day: number;
  index: number;
  name: string;
  time: string;
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
  addingDay?: boolean;
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
  addingDay = false,
}: ScheduleBoardProps) {
  const { t, i18n } = useTranslation("planner");
  const locale = i18n.language;

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
        onClick={() => onOpen(day, index)}
      />
    );

  return (
    <div className="h-full min-h-0 overflow-auto p-[62px_22px_20px]">
      <div
        className="grid min-w-[1180px] gap-3.5"
        style={{
          gridTemplateColumns: `repeat(${trip.days.length + 1}, minmax(228px, 1fr))`,
        }}
      >
        {trip.days.map((d) => {
          const dayStops = trip.stops.filter((s) => s.day === d.number);
          const date = dayDateLabel(trip, d, locale);
          const headerMeta = [date, d.city].filter(Boolean).join(" · ");
          return (
            <div key={d.number} className="flex min-w-[228px] flex-col gap-2.5">
              <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-2.5 shadow-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 flex-none rounded-full"
                    style={{ background: d.color }}
                  />
                  <span className="font-heading text-base font-semibold text-balance">
                    {t("days.day", { n: d.number })}
                  </span>
                </div>
                {headerMeta ? (
                  <span className="pl-4 font-mono text-[11px] text-muted-foreground tabular-nums">
                    {headerMeta}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col">
                {insertSlot(d.number, 0)}
                {dayStops.map((s, idx) => (
                  <div key={s.id} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => onSelectStop(s.id)}
                      className="wf-enter flex flex-col gap-1 rounded-lg border border-border border-l-[3px] bg-card p-2.5 text-left shadow-xs transition-[border-color,box-shadow,scale] duration-150 hover:border-corn-300 hover:shadow-sm active:scale-[0.96]"
                      style={{
                        borderLeftColor: d.color,
                        animationDelay: `${idx * 90}ms`,
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {s.time}
                        </span>
                        <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                          {s.duration}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CategoryIcon category={s.category} />
                        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-pretty">
                          {s.name}
                        </span>
                      </div>
                      <span className="pl-7 text-xs text-muted-foreground text-pretty tabular-nums">
                        {t(`category.${s.category}`)}
                        {s.cost
                          ? ` · ${t("detail.perPerson", {
                              amount: formatMoney(
                                s.cost,
                                s.costCurrency || trip.currency,
                              ),
                            })}`
                          : ""}
                        {s.votes.length
                          ? ` · ${t("schedule.voteCount", { count: s.votes.length })}`
                          : ""}
                      </span>
                    </button>
                    {insertSlot(d.number, idx + 1)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex min-w-[228px] flex-col gap-2.5">
          <div className="h-14" aria-hidden="true" />
          <button
            type="button"
            onClick={onAddDay}
            disabled={addingDay}
            className="group flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground transition-[border-color,background-color,color,scale] duration-150 hover:border-border-strong hover:bg-accent hover:text-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-60"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-accent text-corn-600 transition-[background-color] group-hover:bg-brand-muted">
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
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </span>
            {t("days.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

function InsertTrigger({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-4 items-center opacity-0 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100"
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
  const { t } = useTranslation("planner");
  const { t: tc } = useTranslation("common");
  const located = compose.lat != null && compose.lng != null;
  const hasOptions =
    compose.category != null || compose.cost != null || !!compose.note;
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
        className="relative flex h-8 w-fit items-center gap-1 rounded-md pl-1.5 pr-2 text-xs font-medium text-muted-foreground transition-[color,scale] duration-100 after:absolute after:-inset-1 after:content-[''] hover:text-foreground active:scale-[0.96]"
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
              items={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={compose.costCurrency ?? defaultCurrency}
              onValueChange={(value) =>
                onChange({ costCurrency: (value as string) ?? defaultCurrency })
              }
            >
              <SelectTrigger
                className="w-[92px] flex-none rounded-lg tabular-nums"
                aria-label={t("schedule.currencyLabel")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
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
