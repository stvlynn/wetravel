import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import { findDay } from "@/entities/trip";
import { formatMoney, cn, useEnterOnUpdate, usePresence } from "@/shared/lib";
import { DayPills } from "./DayPills";
import { StopDetail } from "./StopDetail";

export interface SidebarProps {
  trip: Trip;
  numbers: Map<string, number>;
  day: number;
  onDayChange: (day: number) => void;
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  onCloseDetail: () => void;
  currentUserId: string;
  onToggleVote: (stopId: string) => void;
  onComment: (stopId: string, text: string) => void;
  commentPending?: boolean;
}

export function Sidebar(props: SidebarProps) {
  const { t } = useTranslation("planner");
  const { trip, numbers, day, selectedStopId } = props;

  const selectedStop = selectedStopId
    ? trip.stops.find((s) => s.id === selectedStopId)
    : undefined;

  const showDetail = !!selectedStop;
  const { mounted: detailMounted, exiting: detailExiting } = usePresence(showDetail);
  const listEnter = useEnterOnUpdate(selectedStopId);

  const visibleDays = day === 0 ? trip.days : trip.days.filter((d) => d.number === day);
  const visibleCount =
    day === 0
      ? trip.stops.length
      : trip.stops.filter((s) => s.day === day).length;

  let stopIndex = 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {detailMounted && selectedStop ? (
        <div
          className={cn(
            "flex h-full min-h-0 flex-col",
            detailExiting ? "wf-exit" : "wf-enter",
          )}
        >
          <StopDetail
            trip={trip}
            stop={selectedStop}
            currentUserId={props.currentUserId}
            onClose={props.onCloseDetail}
            onToggleVote={props.onToggleVote}
            onComment={props.onComment}
            commentPending={props.commentPending}
          />
        </div>
      ) : (
        <>
          <div
            className={cn(
              "flex flex-col gap-2.5 px-4 pt-3.5 pb-2.5",
              listEnter && "wf-enter",
            )}
            style={listEnter ? { animationDelay: "0ms" } : undefined}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-lg font-semibold tracking-tight">
                {t("itinerary.title")}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {t("itinerary.count", { count: visibleCount })}
              </span>
            </div>
            <DayPills trip={trip} day={day} onDayChange={props.onDayChange} />
          </div>

          <div className="flex-1 overflow-auto" key={day}>
            {visibleDays.map((d) => {
              const dayStops = trip.stops.filter((s) => s.day === d.number);
              return (
                <div key={d.number}>
                  <div className="sticky top-0 z-[2] flex items-center gap-2 border-y border-border bg-card px-4 py-2">
                    <span
                      className="size-2.5 flex-none rounded-full"
                      style={{ background: d.color }}
                    />
                    <span className="text-sm font-semibold text-foreground">
                      {t("days.groupLabel", { n: d.number, date: d.dateLabel })}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {findDay(trip, d.number)?.city}
                    </span>
                  </div>
                  {dayStops.map((s) => {
                    const voted = s.votes.includes(props.currentUserId);
                    const selected = s.id === selectedStopId;
                    const index = stopIndex++;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => props.onSelectStop(s.id)}
                        className={cn(
                          "wf-enter flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-[background-color,color,scale] duration-100 active:scale-[0.96]",
                          selected ? "bg-brand-muted" : "hover:bg-muted",
                        )}
                        style={{ animationDelay: `${index * 90}ms` }}
                      >
                        <span
                          className={cn(
                            "flex size-6 flex-none items-center justify-center text-[11px] font-semibold tabular-nums text-white",
                            s.transit ? "rounded-[7px]" : "rounded-full",
                          )}
                          style={{ background: d.color }}
                        >
                          {numbers.get(s.id)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-base font-medium">
                            {s.name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground tabular-nums">
                            {s.time}
                            {" · "}
                            {s.area}
                            {s.cost
                              ? ` · ${t("detail.perPerson", {
                                  amount: formatMoney(
                                    s.cost,
                                    s.costCurrency || trip.currency,
                                  ),
                                })}`
                              : ""}
                          </span>
                        </span>
                        <span className="flex flex-none items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex h-[22px] items-center gap-1 rounded-sm px-1.5 text-[11px] tabular-nums",
                              voted
                                ? "bg-brand-muted text-corn-600"
                                : "bg-secondary text-muted-foreground",
                            )}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="11"
                              height="11"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M18 15l-6-6-6 6" />
                            </svg>
                            {s.votes.length}
                          </span>
                          {s.comments.length ? (
                            <span className="inline-flex h-[22px] items-center gap-1 rounded-sm bg-secondary px-1.5 text-[11px] text-muted-foreground tabular-nums">
                              <svg
                                viewBox="0 0 24 24"
                                width="11"
                                height="11"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M21 11.5a8.38 8.38 0 0 1-9 8.36 8.5 8.5 0 0 1-3.9-.94L3 20l1.08-4.1A8.5 8.5 0 1 1 21 11.5z" />
                              </svg>
                              {s.comments.length}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            <div className="h-3" />
          </div>
        </>
      )}
    </div>
  );
}
