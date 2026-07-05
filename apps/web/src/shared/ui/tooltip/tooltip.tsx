import type React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn, popupMotionClasses } from "@/shared/lib";

/** coss-style Tooltip adapted to wetravel tokens (Base UI under the hood). */
export const Tooltip: typeof TooltipPrimitive.Root = TooltipPrimitive.Root;

export const TooltipProvider: typeof TooltipPrimitive.Provider =
  TooltipPrimitive.Provider;

export function TooltipTrigger({
  className,
  ...props
}: TooltipPrimitive.Trigger.Props): React.ReactElement {
  return (
    <TooltipPrimitive.Trigger
      className={className}
      data-slot="tooltip-trigger"
      {...props}
    />
  );
}

export function TooltipPopup({
  children,
  className,
  sideOffset = 6,
  side = "top",
  align = "center",
  portalProps,
  ...props
}: TooltipPrimitive.Popup.Props & {
  align?: TooltipPrimitive.Positioner.Props["align"];
  sideOffset?: TooltipPrimitive.Positioner.Props["sideOffset"];
  side?: TooltipPrimitive.Positioner.Props["side"];
  portalProps?: TooltipPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <TooltipPrimitive.Portal {...portalProps}>
      <TooltipPrimitive.Positioner
        align={align}
        className="z-50"
        data-slot="tooltip-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          className={cn(
            "max-w-48 rounded-md bg-foreground px-2 py-1 text-xs text-background text-pretty shadow-md",
            popupMotionClasses,
            className,
          )}
          data-slot="tooltip-popup"
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { TooltipPrimitive };
