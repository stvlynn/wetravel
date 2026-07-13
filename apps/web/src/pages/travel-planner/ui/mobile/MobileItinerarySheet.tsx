import { useState } from "react";
import { List } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, pressable } from "@/shared/lib";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/shared/ui/drawer";
import { Sidebar, type SidebarProps } from "../Sidebar";

/**
 * Floating pill on the mobile map mode that opens the day-grouped itinerary
 * as a bottom sheet. Selecting a stop closes the sheet so the stop detail
 * surface can take over.
 */
export function MobileItinerarySheet(props: SidebarProps) {
  const { t } = useTranslation("planner");
  const [open, setOpen] = useState(false);
  const stopCount = props.trip.stops.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "pointer-events-auto absolute bottom-3 left-3 z-20 flex h-11 items-center gap-2 rounded-full bg-card/95 px-4 text-sm font-medium shadow-[var(--shadow-border),var(--shadow-md)] backdrop-blur-sm",
          pressable,
        )}
      >
        <List aria-hidden="true" className="size-4" />
        {t("itinerary.title")}
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {t("itinerary.count", { count: stopCount })}
        </span>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent side="bottom" className="h-[85dvh]">
          <DrawerTitle className="sr-only">{t("itinerary.title")}</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col">
            <Sidebar
              {...props}
              // The sheet always shows the list; the detail sheet owns selection.
              selectedStopId={null}
              onSelectStop={(id) => {
                setOpen(false);
                props.onSelectStop(id);
              }}
              onExpandNote={(id) => {
                setOpen(false);
                props.onExpandNote(id);
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
