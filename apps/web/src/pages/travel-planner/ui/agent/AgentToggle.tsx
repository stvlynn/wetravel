import { useTranslation } from "react-i18next";
import { PanelToggleIcon } from "@/widgets/app-sidebar";
import { cn } from "@/shared/lib";

/** Collapsed-state agent entry: a quiet panel-toggle button in the top-right
 * corner, mirroring the left sidebar's expand control. */
export function AgentToggle({
  onOpen,
  /** Shift left on the map tab so MapLibre zoom controls keep the corner. */
  reserveMapControls = false,
}: {
  onOpen: () => void;
  reserveMapControls?: boolean;
}) {
  const { t } = useTranslation("agent");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("toggle.open")}
      title={t("toggle.open")}
      className={cn(
        "wf-enter wf-interactive wf-pressable fixed top-3 z-20 flex size-8 items-center justify-center rounded-lg border border-border bg-card/85 text-muted-foreground shadow-sm backdrop-blur-md hover:bg-accent hover:text-foreground",
        reserveMapControls ? "right-14" : "right-3",
      )}
    >
      <PanelToggleIcon className="size-4" />
    </button>
  );
}
