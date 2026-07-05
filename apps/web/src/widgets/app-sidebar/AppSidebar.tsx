import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { UserMenu } from "@/widgets/user-menu";
import { cn } from "@/shared/lib";

export interface AppSidebarProps {
  /** Replaces the default brand row (e.g. a back button + trip title). */
  top?: ReactNode;
  /** Scrollable middle content: page nav or the trip itinerary. */
  children?: ReactNode;
  className?: string;
}

const STORAGE_KEY = "wf.sidebar.collapsed";

/** A left-pointing "toggle panel" glyph used for both collapse and expand. */
function PanelToggleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

/** Persistent left sidebar shared by the trips list and the trip planner.
 *
 * The sidebar is the base layer; the main panel floats above it with rounded
 * left corners (see the page layouts). A collapse control sits at the sidebar's
 * top-right; when collapsed, a floating expand control appears over the panel.
 * The collapsed preference persists in localStorage. */
export function AppSidebar({ top, children, className }: AppSidebarProps) {
  const { t } = useTranslation("common");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <>
      <aside
        className={cn(
          "relative flex h-dvh flex-none flex-col overflow-hidden bg-sidebar transition-[width,opacity] duration-200 ease-[var(--ease-out)]",
          collapsed ? "pointer-events-none w-0 opacity-0" : "w-[300px] opacity-100",
          className,
        )}
        aria-hidden={collapsed}
      >
        <div className="flex flex-none items-start gap-2 px-4 pt-4 pb-2">
          <div className="min-w-0 flex-1">{top ?? <BrandTitle />}</div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label={t("actions.collapseSidebar")}
            title={t("actions.collapseSidebar")}
            className="-mr-1 flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.96]"
          >
            <PanelToggleIcon className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

        <UserMenu />
      </aside>

      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={t("actions.expandSidebar")}
          title={t("actions.expandSidebar")}
          className="wf-enter fixed left-3 top-3 z-20 flex size-8 items-center justify-center rounded-lg border border-border bg-card/85 text-muted-foreground shadow-sm backdrop-blur-md transition-[background-color,color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.96]"
        >
          <PanelToggleIcon className="size-4" />
        </button>
      ) : null}
    </>
  );
}

function BrandTitle() {
  const { t } = useTranslation("common");
  return (
    <span className="font-heading text-lg font-semibold">{t("appName")}</span>
  );
}
