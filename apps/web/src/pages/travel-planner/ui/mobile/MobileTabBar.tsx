import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib";

export interface MobileTabItem<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

/** Bottom navigation bar for the planner's primary modes on narrow screens. */
export function MobileTabBar<T extends string>({
  items,
  value,
  onValueChange,
}: {
  items: MobileTabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
}) {
  const { t } = useTranslation("planner");
  return (
    <nav
      aria-label={t("nav.label")}
      className="flex flex-none items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {items.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onValueChange(v)}
            className={cn(
              "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-[color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] active:scale-[var(--press-scale)]",
              active
                ? "text-corn-600"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
            <span className="truncate text-[11px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
