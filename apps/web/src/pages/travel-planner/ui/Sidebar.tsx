import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import { dayDateLabel, findDay } from "@/entities/trip";
import type { UpdateStopInput } from "@/shared/api";
import { DayWeatherIcon } from "@/features/weather";
import { ScrollEdgeFade } from "@/shared/ui/scroll-edge-fade";
import { DayPills } from "./DayPills";
import { StopCard } from "./StopCard";
import { StopDetail } from "./StopDetail";

export interface SidebarProps {
  trip: Trip;
  day: number;
  onDayChange: (day: number) => void;
  selectedStopId: string | null;
  onSelectStop: (id: string) => void;
  onCloseDetail: () => void;
  currentUserId: string;
  canEdit: boolean;
  onToggleVote: (stopId: string) => void;
  onComment: (stopId: string, text: string) => void;
  commentPending?: boolean;
  onUpdateStop: (stopId: string, patch: UpdateStopInput) => void;
  onChangeStopDay: (stopId: string, day: number) => void;
  onExpandNote: (stopId: string) => void;
  onWriteTravelogue: (stopId: string) => void;
}

export function Sidebar(props: SidebarProps) {
  const { t, i18n } = useTranslation("planner");
  const { trip, day, selectedStopId } = props;

  const selectedStop = selectedStopId
    ? trip.stops.find((s) => s.id === selectedStopId)
    : undefined;

  const visibleDays = day === 0 ? trip.days : trip.days.filter((d) => d.number === day);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {selectedStop ? (
        <StopDetail
          trip={trip}
          stop={selectedStop}
          currentUserId={props.currentUserId}
          canEdit={props.canEdit}
          onClose={props.onCloseDetail}
          onToggleVote={props.onToggleVote}
          onComment={props.onComment}
          commentPending={props.commentPending}
          onUpdateStop={props.onUpdateStop}
          onChangeStopDay={props.onChangeStopDay}
          onExpandNote={() => props.onExpandNote(selectedStop.id)}
          onWriteTravelogue={() => props.onWriteTravelogue(selectedStop.id)}
        />
      ) : (
        <>
          <div className="px-4 pt-3.5 pb-2.5">
            <DayPills trip={trip} day={day} onDayChange={props.onDayChange} />
          </div>

          <ScrollEdgeFade
            orientation="vertical"
            showControls={false}
            fadeSize={40}
            className="min-h-0 flex-1"
          >
            {visibleDays.map((d) => {
              const dayStops = trip.stops.filter((s) => s.day === d.number);
              return (
                <div key={d.number} className="flex flex-col gap-2.5 pb-2.5">
                  <div className="sticky top-0 z-[2] flex items-center gap-2 border-y border-border bg-card px-4 py-2">
                    <span
                      className="size-2.5 flex-none rounded-full"
                      style={{ background: d.color }}
                    />
                    <span className="text-sm font-semibold text-foreground">
                      {t("days.groupLabel", {
                        n: d.number,
                        date: dayDateLabel(trip, d, i18n.language),
                      })}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {findDay(trip, d.number)?.city}
                    </span>
                    <DayWeatherIcon trip={trip} dayNumber={d.number} size={18} />
                  </div>
                  <div className="flex flex-col gap-2.5 px-4">
                    {dayStops.map((s) => (
                      <StopCard
                        key={s.id}
                        trip={trip}
                        stop={s}
                        selected={s.id === selectedStopId}
                        onSelect={props.onSelectStop}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="h-1" />
          </ScrollEdgeFade>
        </>
      )}
    </div>
  );
}
