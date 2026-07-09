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
  /** Controlled collapsed state. When omitted, the sidebar manages its own
   * localStorage-backed state for backward compatibility. */
  collapsed?: boolean;
  /** Called when the collapse/expand button is activated. */
  onCollapsedChange?: (collapsed: boolean) => void;
}

const STORAGE_KEY = "wf.sidebar.collapsed";

/** A left-pointing "toggle panel" glyph used for both collapse and expand. */
export function PanelToggleIcon({ className }: { className?: string }) {
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
 *
 * When `collapsed`/`onCollapsedChange` are provided the parent controls the
 * state (used by the resizable travel-planner layout). Otherwise the sidebar
 * falls back to its own localStorage-backed state. */
export function AppSidebar({
  top,
  children,
  className,
  collapsed: controlledCollapsed,
  onCollapsedChange,
}: AppSidebarProps) {
  const { t } = useTranslation("common");
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  const isControlled = controlledCollapsed !== undefined;
  const collapsed = isControlled ? controlledCollapsed : internalCollapsed;

  useEffect(() => {
    if (isControlled || typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, internalCollapsed ? "1" : "0");
  }, [isControlled, internalCollapsed]);

  const setCollapsed = (next: boolean) => {
    if (isControlled) {
      onCollapsedChange?.(next);
    } else {
      setInternalCollapsed(next);
    }
  };

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={t("actions.expandSidebar")}
          title={t("actions.expandSidebar")}
          className="wf-enter wf-interactive wf-pressable fixed left-3 top-3 z-20 flex size-8 items-center justify-center rounded-lg border border-border bg-card/85 text-muted-foreground shadow-sm backdrop-blur-md hover:bg-accent hover:text-foreground"
        >
          <PanelToggleIcon className="size-4" />
        </button>
      ) : null}

      <aside
        aria-hidden={collapsed}
        className={cn(
          "relative flex h-dvh flex-none flex-col overflow-hidden bg-sidebar",
          isControlled
            ? "w-full min-w-0"
            : cn(
                "transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]",
                collapsed ? "w-0" : "w-[300px]",
              ),
          className,
        )}
      >
        <div
          className={cn(
            "flex h-full flex-col transition-opacity duration-[var(--dur-slow)] ease-[var(--ease-out)]",
            isControlled ? "min-w-[280px] w-full" : "w-[300px]",
            collapsed && "pointer-events-none opacity-0",
          )}
        >
          <div className="flex flex-none items-start gap-2 px-4 pt-4 pb-2">
            <div className="min-w-0 flex-1">
              {top ?? (
                <span className="font-heading text-lg font-semibold">
                  {t("appName")}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label={t("actions.collapseSidebar")}
              title={t("actions.collapseSidebar")}
              className="wf-interactive wf-pressable -mr-1 flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <PanelToggleIcon className="size-4" />
            </button>
          </div>

          <div className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>

          <UserMenu />
        </div>
      </aside>
    </>
  );
}
