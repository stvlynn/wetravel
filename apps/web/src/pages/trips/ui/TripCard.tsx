import { useTranslation } from "react-i18next";
import type { TripSummary } from "@/entities/trip";
import { Badge } from "@/shared/ui/badge";
import { Card } from "@/shared/ui/card";
import { Avatar } from "@/shared/ui/avatar";
import { cn } from "@/shared/lib";

/** Max avatars shown before collapsing the rest into a "+N" chip. */
const MAX_AVATARS = 4;

const STATUS_VARIANT = {
  active: "brand",
  planning: "warning",
  settled: "success",
} as const;

/** Stable pseudo-random float in [0, 1) derived from a string seed. */
function seededFloat(seed: string, i: number): number {
  let h = 0;
  const s = seed + String(i);
  for (let k = 0; k < s.length; k++) {
    h = (h * 31 + s.charCodeAt(k)) | 0;
  }
  return (Math.abs(Math.sin(h)) % 1) || 0;
}

/** Generate a decorative route map path and stop circles for a trip card. */
function routeMapForTrip(trip: TripSummary): { path: string; points: { x: number; y: number }[] } {
  const count = Math.max(2, Math.min(6, trip.stopCount || 2));
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const x = 40 + t * 240 + (seededFloat(trip.id, i * 2) - 0.5) * 24;
    const y = 32 + seededFloat(trip.id, i * 2 + 1) * 56;
    points.push({ x, y });
  }

  if (points.length < 2) {
    return { path: "", points };
  }

  // Catmull-Rom spline converted to cubic beziers for a smooth route line.
  const get = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!;
  const first = points[0]!;
  let path = `M ${first.x} ${first.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = get(i);
    const p1 = get(i + 1);
    const p2 = get(i + 2);
    const p3 = get(i + 3);
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return { path, points };
}

export function TripCard({
  trip,
  onOpen,
}: {
  trip: TripSummary;
  onOpen: () => void;
}) {
  const { t } = useTranslation("trips");

  const shown = trip.members.slice(0, MAX_AVATARS);
  const overflow = trip.members.length - shown.length;
  const route = routeMapForTrip(trip);
  const routeColor = trip.status === "active" ? trip.coverColor : "var(--ink-400)";

  const meta = [
    trip.startLabel && trip.endLabel
      ? t("card.dates", { start: trip.startLabel, end: trip.endLabel })
      : null,
    t("card.stops", { count: trip.stopCount }),
    trip.creatorName ? t("card.by", { name: trip.creatorName }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      className="wf-enter group cursor-pointer overflow-hidden border border-border p-0 transition-[border-color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:border-corn-300 hover:shadow-md active:scale-[var(--press-scale)]"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="relative h-[116px] bg-ink-150">
        <svg
          viewBox="0 0 320 116"
          className="absolute inset-0 size-full"
        >
          {route.path && (
            <path
              d={route.path}
              fill="none"
              stroke={routeColor}
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
          )}
          {route.points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="5"
              fill={routeColor}
              stroke="white"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>
      <div className="flex flex-col gap-2.5 p-3.5 px-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-heading text-base font-semibold tracking-tight text-balance">
            {trip.title}
          </h2>
          <Badge variant={STATUS_VARIANT[trip.status]}>
            {t(`status.${trip.status}`)}
          </Badge>
        </div>
        {meta && (
          <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {meta}
          </p>
        )}
        <div className="flex items-center justify-between">
          {shown.length > 0 ? (
            <div className="flex flex-none items-center">
              {shown.map((m, i) => (
                <Avatar
                  key={m.id}
                  name={m.name}
                  bg={m.avatarBg}
                  fg={m.avatarFg}
                  src={m.image}
                  seed={m.id}
                  size={24}
                  stackIndex={i}
                  zIndex={shown.length - i}
                />
              ))}
              {overflow > 0 ? (
                <span
                  className="-ml-[7px] inline-flex size-6 flex-none items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground ring-2 ring-card outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                  title={t("card.moreMembers", { count: overflow })}
                >
                  +{overflow}
                </span>
              ) : null}
            </div>
          ) : (
            <span />
          )}
          <span
            className={cn(
              "text-xs font-medium text-corn-600 transition-[translate] duration-150",
              "group-hover:translate-x-0.5",
            )}
          >
            {t("card.open")} →
          </span>
        </div>
      </div>
    </Card>
  );
}
