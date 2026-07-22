import type { Trip } from "@/entities/trip";
import type { Stop } from "@/entities/stop";
import type { UpdateStopInput } from "@/shared/api";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/shared/ui/drawer";
import { StopDetail } from "../StopDetail";

/** Bottom detail surface for the selected stop on the mobile map mode. */
export function MobileStopDetailSheet({
  trip,
  stop,
  currentUserId,
  canEdit,
  onClose,
  onToggleVote,
  onComment,
  commentPending,
  onUpdateStop,
  onChangeStopDay,
  onExpandNote,
  onWriteTravelogue,
}: {
  trip: Trip;
  stop: Stop | undefined;
  currentUserId: string;
  canEdit: boolean;
  onClose: () => void;
  onToggleVote: (stopId: string) => void;
  onComment: (stopId: string, text: string) => void;
  commentPending?: boolean;
  onUpdateStop: (stopId: string, patch: UpdateStopInput) => void;
  onChangeStopDay: (stopId: string, day: number) => void;
  onExpandNote: (stopId: string) => void;
  onWriteTravelogue: (stopId: string) => void;
}) {
  return (
    <Drawer open={Boolean(stop)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent side="bottom" className="h-[70%]">
        {stop ? (
          <>
            <DrawerTitle className="sr-only">{stop.name}</DrawerTitle>
            <div className="flex min-h-0 flex-1 flex-col">
              <StopDetail
                trip={trip}
                stop={stop}
                currentUserId={currentUserId}
                canEdit={canEdit}
                onClose={onClose}
                onToggleVote={onToggleVote}
                onComment={onComment}
                commentPending={commentPending}
                onUpdateStop={onUpdateStop}
                onChangeStopDay={onChangeStopDay}
                onExpandNote={() => onExpandNote(stop.id)}
                onWriteTravelogue={() => onWriteTravelogue(stop.id)}
              />
            </div>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
