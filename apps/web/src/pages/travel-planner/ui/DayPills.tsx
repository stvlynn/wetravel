import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import { cn } from "@/shared/lib";

export function DayPills({
  trip,
  day,
  onDayChange,
}: {
  trip: Trip;
  day: number;
  onDayChange: (day: number) => void;
}) {
  const { t } = useTranslation("planner");
  const pills = [
    { n: 0, label: t("days.all") },
    ...trip.days.map((d) => ({ n: d.number, label: t("days.day", { n: d.number }) })),
  ];

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {pills.map((p) => {
        const active = day === p.n;
        return (
          <button
            key={p.n}
            type="button"
            aria-pressed={active}
            onClick={() => onDayChange(p.n)}
            className={cn(
              "relative h-7 flex-none rounded-full px-3 text-[12.5px] font-medium transition-[background-color,color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] active:scale-[var(--press-scale)]",
              active
                ? "bg-primary text-primary-foreground shadow-[0_0_0_1px_var(--primary)]"
                : "bg-card text-muted-foreground shadow-[0_0_0_1px_var(--border)] hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
