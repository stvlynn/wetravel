import type React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn, interactive } from "@/shared/lib";

/** coss-style Select adapted to wetravel tokens (Base UI under the hood).
 * Inline icons and theme tokens replace the coss registry / lucide deps. */
export const Select: typeof SelectPrimitive.Root = SelectPrimitive.Root;

function ChevronsUpDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="-mr-0.5 size-4 shrink-0 opacity-70"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

export function SelectTrigger({
  className,
  children,
  static: isStatic,
  ...props
}: SelectPrimitive.Trigger.Props & { static?: boolean }): React.ReactElement {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "relative flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm text-foreground",
        "outline-none transition-[background-color,border-color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)] active:scale-[var(--press-scale)]",
        "after:absolute after:-inset-0.5 after:content-['']",
        "hover:border-ring/50 hover:bg-accent/40 data-[popup-open]:border-ring",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        isStatic && "active:scale-100",
        className,
      )}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon data-slot="select-icon">
        <ChevronsUpDown />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectValue({
  className,
  ...props
}: SelectPrimitive.Value.Props): React.ReactElement {
  return (
    <SelectPrimitive.Value
      className={cn(
        "min-w-0 flex-1 truncate data-[placeholder]:text-muted-foreground/70",
        className,
      )}
      data-slot="select-value"
      {...props}
    />
  );
}

export function SelectPopup({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignItemWithTrigger = false,
  portalProps,
  ...props
}: SelectPrimitive.Popup.Props & {
  portalProps?: SelectPrimitive.Portal.Props;
  side?: SelectPrimitive.Positioner.Props["side"];
  sideOffset?: SelectPrimitive.Positioner.Props["sideOffset"];
  align?: SelectPrimitive.Positioner.Props["align"];
  alignItemWithTrigger?: SelectPrimitive.Positioner.Props["alignItemWithTrigger"];
}): React.ReactElement {
  return (
    <SelectPrimitive.Portal {...portalProps}>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        className="z-50 select-none"
        data-slot="select-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            "max-h-[min(var(--available-height),20rem)] min-w-(--anchor-width) origin-(--transform-origin) " +
              "overflow-hidden rounded-lg bg-popover text-foreground shadow-[var(--shadow-border),var(--shadow-lg)] outline-none " +
              "transition-[transform,opacity] duration-[var(--dur-slow)] ease-[var(--ease-out)] " +
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 " +
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          data-slot="select-popup"
          {...props}
        >
          <SelectPrimitive.List
            className="max-h-[19rem] overflow-y-auto p-1"
            data-slot="select-list"
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props): React.ReactElement {
  return (
    <SelectPrimitive.Item
      className={cn(
        `grid min-h-10 cursor-default select-none grid-cols-[1rem_1fr] items-center gap-2 rounded-sm py-2 pl-2 pr-3 text-sm outline-none ${interactive}`,
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="col-start-1 flex items-center justify-center text-corn-600">
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="col-start-2 min-w-0 truncate">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props): React.ReactElement {
  return (
    <SelectPrimitive.Separator
      className={cn("mx-2 my-1 h-px bg-border", className)}
      data-slot="select-separator"
      {...props}
    />
  );
}

export function SelectGroup(
  props: SelectPrimitive.Group.Props,
): React.ReactElement {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

export function SelectGroupLabel(
  props: SelectPrimitive.GroupLabel.Props,
): React.ReactElement {
  return (
    <SelectPrimitive.GroupLabel
      className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
      data-slot="select-group-label"
      {...props}
    />
  );
}

export { SelectPrimitive };
