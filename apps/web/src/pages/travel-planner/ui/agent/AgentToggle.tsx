import { useTranslation } from "react-i18next";
import { PanelToggleIcon } from "@/widgets/app-sidebar";

/** Collapsed-state agent entry: a quiet panel-toggle button in the top-right
 * corner, mirroring the left sidebar's expand control. */
export function AgentToggle({
  onOpen,
}: {
  onOpen: () => void;
}) {
  const { t } = useTranslation("agent");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("toggle.open")}
      title={t("toggle.open")}
      className="wf-enter wf-interactive wf-pressable fixed top-3 right-3 z-20 flex size-8 items-center justify-center rounded-lg border border-border bg-card/85 text-muted-foreground shadow-sm backdrop-blur-md hover:bg-accent hover:text-foreground"
    >
      <PanelToggleIcon className="size-4" />
    </button>
  );
}
