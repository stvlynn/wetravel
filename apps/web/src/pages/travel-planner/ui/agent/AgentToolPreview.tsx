import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import {
  CategoryIcon,
  STOP_CATEGORIES,
  type Stop,
  type StopCategory,
} from "@/entities/stop";
import { formatMoney } from "@/shared/lib";
import { StopCard } from "../StopCard";

/** Renders a write-tool's arguments as the same micro-UI the planner uses, so
 * approval cards show a real preview instead of raw JSON. Stop mutations reuse
 * `StopCard`; the remaining tools fall back to a single labeled line. */
export function AgentToolPreview({
  toolName,
  input,
  trip,
}: {
  toolName: string;
  input: unknown;
  trip: Trip;
}) {
  const { t } = useTranslation("agent");
  const args = asRecord(input);

  if (!args) return <Summary>{t("preview.unknown")}</Summary>;

  switch (toolName) {
    case "insertStop": {
      const stop = draftToStop(args);
      const day = num(args.day) ?? stop.day;
      const index = num(args.index) ?? 0;
      return (
        <div className="flex flex-col gap-1.5">
          <Slot>{t("preview.daySlot", { day, position: index + 1 })}</Slot>
          <PreviewStopCard trip={trip} stop={stop} />
        </div>
      );
    }

    case "updateStop": {
      const existing = trip.stops.find((s) => s.id === str(args.stopId));
      if (!existing) return <Summary>{t("preview.unknown")}</Summary>;
      const merged = mergeStopChanges(existing, asRecord(args.changes));
      return <PreviewStopCard trip={trip} stop={merged} />;
    }

    case "moveStop": {
      const existing = trip.stops.find((s) => s.id === str(args.stopId));
      const day = num(args.day);
      const index = num(args.index);
      if (!existing) {
        return day != null && index != null ? (
          <Summary>{t("preview.moveTo", { day, position: index + 1 })}</Summary>
        ) : (
          <Summary>{t("preview.unknown")}</Summary>
        );
      }
      return (
        <div className="flex flex-col gap-1.5">
          <PreviewStopCard trip={trip} stop={existing} />
          {day != null && index != null ? (
            <Slot>{t("preview.moveTo", { day, position: index + 1 })}</Slot>
          ) : null}
        </div>
      );
    }

    case "addExpense":
      return (
        <ExpensePreview
          trip={trip}
          draft={{
            description: str(args.description) ?? "",
            amount: num(args.amount) ?? 0,
            currency: str(args.currency) ?? "",
            category: toCategory(args.category) ?? "Plan",
            payer: str(args.payer) ?? "",
            participants: strArr(args.participants) ?? [],
          }}
        />
      );

    case "updateExpense": {
      const existing = trip.expenses.find(
        (e) => e.id === str(args.expenseId),
      );
      const changes = asRecord(args.changes) ?? {};
      return (
        <ExpensePreview
          trip={trip}
          draft={{
            description: str(changes.description) ?? existing?.description ?? "",
            amount: num(changes.amount) ?? existing?.amount ?? 0,
            currency: str(changes.currency) ?? existing?.currency ?? "",
            category:
              toCategory(changes.category) ?? existing?.category ?? "Plan",
            payer: str(changes.payer) ?? existing?.payer ?? "",
            participants: strArr(changes.participants) ??
              existing?.participants ?? [],
          }}
        />
      );
    }

    case "renameTrip":
      return (
        <Summary>
          {t("preview.renameTrip", { title: str(args.title) ?? "" })}
        </Summary>
      );

    case "addDay":
      return <Summary>{t("preview.addDay")}</Summary>;

    case "deleteDay":
      return (
        <Summary>{t("preview.deleteDay", { day: num(args.dayNumber) ?? "?" })}</Summary>
      );

    case "updateDay": {
      const day = num(args.dayNumber) ?? "?";
      const changes = asRecord(args.changes) ?? {};
      const city = str(changes.city);
      return (
        <Summary>
          {city
            ? t("preview.updateDayCity", { day, city })
            : t("preview.updateDay", { day })}
        </Summary>
      );
    }

    case "reorderDays":
      return (
        <Summary>
          {t("preview.reorderDays", {
            order: (strArr(args.order) ?? numArr(args.order) ?? []).join(" → "),
          })}
        </Summary>
      );

    default:
      return <Summary>{t("preview.unknown")}</Summary>;
  }
}

function PreviewStopCard({ trip, stop }: { trip: Trip; stop: Stop }) {
  return (
    <StopCard
      trip={trip}
      stop={stop}
      onSelect={noop}
      className="pointer-events-none w-full"
    />
  );
}

function ExpensePreview({
  trip,
  draft,
}: {
  trip: Trip;
  draft: {
    description: string;
    amount: number;
    currency: string;
    category: StopCategory;
    payer: string;
    participants: string[];
  };
}) {
  const { t } = useTranslation("agent");
  const payer = trip.members.find((m) => m.id === draft.payer);
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-card p-2.5 shadow-[var(--shadow-border)]">
      <CategoryIcon category={draft.category} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-snug">
          {draft.description}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {t("preview.expenseMeta", {
            name: payer?.name ?? "—",
            count: draft.participants.length,
          })}
        </span>
      </div>
      <span className="flex-none font-mono text-sm font-semibold tabular-nums">
        {formatMoney(draft.amount, draft.currency || trip.currency)}
      </span>
    </div>
  );
}

function Slot({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}

function Summary({ children }: { children: ReactNode }) {
  return <span className="text-xs text-pretty text-foreground">{children}</span>;
}

function noop() {}

/** Build a display-only `Stop` from `insertStop` args, applying the same
 * defaults the Trip aggregate uses when fields are omitted. Coordinate-less
 * previews are marked `transit` so `StopCard` skips the weather lookup. */
function draftToStop(args: Record<string, unknown>): Stop {
  const lat = num(args.lat);
  const lng = num(args.lng);
  const hasCoords = lat != null && lng != null;
  return {
    id: "agent-preview",
    day: num(args.day) ?? 1,
    time: str(args.time) || "—",
    duration: str(args.duration) || "1h",
    name: str(args.name) ?? "",
    area: str(args.area) || "TBD",
    category: toCategory(args.category) ?? "Plan",
    lat: hasCoords ? lat : 0,
    lng: hasCoords ? lng : 0,
    cost: num(args.cost) ?? 0,
    costCurrency: str(args.costCurrency) ?? "",
    createdBy: "",
    transit: !hasCoords,
    note: str(args.note) ?? "",
    votes: [],
    comments: [],
  };
}

function mergeStopChanges(
  existing: Stop,
  changes: Record<string, unknown> | null,
): Stop {
  if (!changes) return existing;
  return {
    ...existing,
    name: str(changes.name) ?? existing.name,
    time: str(changes.time) ?? existing.time,
    duration: str(changes.duration) ?? existing.duration,
    area: str(changes.area) ?? existing.area,
    category: toCategory(changes.category) ?? existing.category,
    cost: num(changes.cost) ?? existing.cost,
    costCurrency: str(changes.costCurrency) ?? existing.costCurrency,
    note: str(changes.note) ?? existing.note,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function strArr(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === "string")
    ? (value as string[])
    : undefined;
}

function numArr(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === "number")
    ? (value as number[]).map(String)
    : undefined;
}

function toCategory(value: unknown): StopCategory | undefined {
  return typeof value === "string" &&
    (STOP_CATEGORIES as string[]).includes(value)
    ? (value as StopCategory)
    : undefined;
}
