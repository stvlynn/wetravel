import { useTranslation } from "react-i18next";
import type { Trip } from "@/entities/trip";
import type { AgentSuggestion } from "@/shared/api";
import { PanelToggleIcon } from "@/widgets/app-sidebar";
import { cn } from "@/shared/lib";
import { AgentChat } from "./AgentChat";

/** Right base-layer panel, mirroring the left `AppSidebar`: it sits beneath the
 * main panel (same `bg-sidebar` layer) and reveals via a width transition. When
 * open, the main panel rounds its right corners against it. */
export function AgentDrawer({
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
    <aside
      aria-hidden={!open}
      className={cn(
        "relative flex h-dvh flex-none flex-col overflow-hidden bg-sidebar transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]",
        open ? "w-[min(360px,85vw)]" : "w-0",
      )}
    >
      <div
        className={cn(
          "flex h-full w-[min(360px,85vw)] flex-col transition-opacity duration-[var(--dur-slow)] ease-[var(--ease-out)]",
          !open && "pointer-events-none opacity-0",
        )}
      >
        <div className="flex flex-none items-center px-3 pt-4 pb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("toggle.close")}
            title={t("toggle.close")}
            className="wf-interactive wf-pressable -ml-1 flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelToggleIcon className="size-4" />
          </button>
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
      </div>
    </aside>
  );
}
