import { useTranslation } from "react-i18next";
import { PanelToggleIcon } from "@/widgets/app-sidebar";
import { cn, interactive } from "@/shared/lib";
import { BackButton } from "../BackButton";

/** Compact top bar for the narrow-screen planner shell. */
export function MobilePlannerHeader({
  title,
  subtitle,
  onBack,
  onRename,
  onOpenAgent,
  nativeChrome = false,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  onRename?: (title: string) => void;
  /** Present only when the deployment has the trip agent enabled. */
  onOpenAgent?: () => void;
  /**
   * True inside the WeChat Mini Program WebView, where the native navigation
   * bar already renders the title and the back affordance; the header then
   * keeps only the subtitle and the agent toggle.
   */
  nativeChrome?: boolean;
}) {
  const { t: ta } = useTranslation("agent");
  return (
    <header className="flex flex-none items-center gap-2 border-b border-border bg-background px-2 pt-[max(0.375rem,env(safe-area-inset-top))] pb-1.5">
      <div className="min-w-0 flex-1">
        {nativeChrome ? (
          subtitle ? (
            <span className="block truncate px-1.5 py-2.5 font-mono text-[11px] text-muted-foreground tabular-nums">
              {subtitle}
            </span>
          ) : null
        ) : (
          <BackButton
            onBack={onBack}
            title={title}
            subtitle={subtitle}
            onRename={onRename}
          />
        )}
      </div>
      {onOpenAgent ? (
        <button
          type="button"
          onClick={onOpenAgent}
          aria-label={ta("toggle.open")}
          title={ta("toggle.open")}
          className={cn(
            "flex size-10 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
            interactive,
          )}
        >
          <PanelToggleIcon className="size-4" />
        </button>
      ) : null}
    </header>
  );
}
