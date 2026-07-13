import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import type { AgentSuggestion } from "@/shared/api";
import { cn, interactive } from "@/shared/lib";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/shared/ui/drawer";
import { AgentChat } from "../agent/AgentChat";

/** Full-height agent chat surface for the narrow-screen planner shell. */
export function MobileAgentSheet({
  open,
  tripId,
  trip,
  canEdit,
  applyingId,
  onApproveSuggestion,
  onDenySuggestion,
  onClose,
}: {
  open: boolean;
  tripId: string;
  trip: Trip;
  canEdit: boolean;
  applyingId: string | null;
  onApproveSuggestion: (suggestion: AgentSuggestion) => void;
  onDenySuggestion: (suggestion: AgentSuggestion) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("agent");
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent side="full">
        <div className="flex flex-none items-center gap-2 px-3 pt-3 pb-1">
          <DrawerClose
            aria-label={t("toggle.close")}
            title={t("toggle.close")}
            className={cn(
              "flex size-10 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
              interactive,
            )}
          >
            <X aria-hidden="true" className="size-5" />
          </DrawerClose>
          <DrawerTitle className="text-sm font-semibold text-foreground">
            {t("panel.title")}
          </DrawerTitle>
        </div>
        <AgentChat
          enabled={open}
          tripId={tripId}
          trip={trip}
          canEdit={canEdit}
          applyingId={applyingId}
          onApproveSuggestion={onApproveSuggestion}
          onDenySuggestion={onDenySuggestion}
        />
      </DrawerContent>
    </Drawer>
  );
}
