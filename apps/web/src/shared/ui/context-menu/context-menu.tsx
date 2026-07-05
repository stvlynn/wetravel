import type React from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn, interactive } from "@/shared/lib";

/** coss-style ContextMenu adapted to wetravel tokens (Base UI under the hood).
 * Right-click / long-press a wrapped surface to open a pointer-anchored menu. */
export const ContextMenu: typeof ContextMenuPrimitive.Root =
  ContextMenuPrimitive.Root;

export function ContextMenuTrigger({
  className,
  children,
  ...props
}: ContextMenuPrimitive.Trigger.Props): React.ReactElement {
  return (
    <ContextMenuPrimitive.Trigger
      className={className}
      data-slot="context-menu-trigger"
      {...props}
    >
      {children}
    </ContextMenuPrimitive.Trigger>
  );
}

export function ContextMenuPopup({
  children,
  className,
  sideOffset = 4,
  align = "start",
  side = "bottom",
  portalProps,
  ...props
}: ContextMenuPrimitive.Popup.Props & {
  align?: ContextMenuPrimitive.Positioner.Props["align"];
  sideOffset?: ContextMenuPrimitive.Positioner.Props["sideOffset"];
  side?: ContextMenuPrimitive.Positioner.Props["side"];
  portalProps?: ContextMenuPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <ContextMenuPrimitive.Portal {...portalProps}>
      <ContextMenuPrimitive.Positioner
        align={align}
        className="z-50"
        data-slot="context-menu-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          className={cn(
            "min-w-44 origin-(--transform-origin) rounded-lg bg-popover p-1 text-foreground shadow-[var(--shadow-border),var(--shadow-lg)] outline-none " +
              "transition-[transform,opacity] duration-[var(--dur-slow)] ease-[var(--ease-out)] " +
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 " +
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          data-slot="context-menu-popup"
          {...props}
        >
          {children}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  variant = "default",
  ...props
}: ContextMenuPrimitive.Item.Props & {
  variant?: "default" | "destructive";
}): React.ReactElement {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        `flex min-h-10 cursor-default select-none items-center gap-2 rounded-sm pl-1.5 pr-2 py-1.5 text-sm text-foreground outline-none ${interactive}`,
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-[variant=destructive]:text-destructive-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-60",
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-80",
        className,
      )}
      data-slot="context-menu-item"
      data-variant={variant}
      {...props}
    />
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: ContextMenuPrimitive.Separator.Props): React.ReactElement {
  return (
    <ContextMenuPrimitive.Separator
      className={cn("mx-2 my-1 h-px bg-border", className)}
      data-slot="context-menu-separator"
      {...props}
    />
  );
}

export function ContextMenuGroupLabel({
  className,
  ...props
}: ContextMenuPrimitive.GroupLabel.Props): React.ReactElement {
  return (
    <ContextMenuPrimitive.GroupLabel
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
      data-slot="context-menu-group-label"
      {...props}
    />
  );
}

export { ContextMenuPrimitive };
