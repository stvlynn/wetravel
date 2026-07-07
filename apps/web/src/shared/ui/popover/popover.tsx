import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/shared/lib";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverPortal = PopoverPrimitive.Portal;
export const PopoverTitle = PopoverPrimitive.Title;
export const PopoverDescription = PopoverPrimitive.Description;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverPopup({
  children,
  className,
  sideOffset = 4,
  align = "start",
  side = "bottom",
  ...props
}: PopoverPrimitive.Popup.Props & {
  align?: PopoverPrimitive.Positioner.Props["align"];
  sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"];
  side?: PopoverPrimitive.Positioner.Props["side"];
}): React.ReactElement {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        className="z-50"
        data-slot="popover-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          className={cn(
            "origin-(--transform-origin) rounded-lg bg-popover p-3 text-foreground shadow-[var(--shadow-border),var(--shadow-lg)] outline-none " +
              "transition-[transform,opacity] duration-[var(--dur-slow)] ease-[var(--ease-out)] " +
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 " +
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          data-slot="popover-popup"
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
