import { cn, interactive } from "@/shared/lib";

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
  static?: boolean;
}

/** Segmented tabs (roving via native buttons). Controlled. */
export function Tabs({
  items,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
  static: isStatic,
}: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-secondary p-0.5 shadow-[var(--shadow-border)]",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onValueChange(item.value)}
            className={cn(
              `h-8 flex-1 relative rounded-md px-3 text-xs font-medium ${interactive} after:absolute after:-inset-y-1 after:content-['']`,
              selected
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
              isStatic && "active:scale-100",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
