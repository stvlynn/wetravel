import type React from "react";
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { cn } from "@/shared/lib";

/** coss-style PreviewCard adapted to OpenTrip tokens (Base UI under the hood).
 * Use for rich, non-interactive content revealed on hover/focus. */
export const PreviewCard: typeof PreviewCardPrimitive.Root =
  PreviewCardPrimitive.Root;

export const PreviewCardTrigger: typeof PreviewCardPrimitive.Trigger =
  PreviewCardPrimitive.Trigger;

export function PreviewCardPopup({
  children,
  className,
  sideOffset = 6,
  align = "center",
  side = "top",
  portalProps,
  ...props
}: PreviewCardPrimitive.Popup.Props & {
  align?: PreviewCardPrimitive.Positioner.Props["align"];
  sideOffset?: PreviewCardPrimitive.Positioner.Props["sideOffset"];
  side?: PreviewCardPrimitive.Positioner.Props["side"];
  portalProps?: PreviewCardPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <PreviewCardPrimitive.Portal {...portalProps}>
      <PreviewCardPrimitive.Positioner
        align={align}
        className="z-50"
        data-slot="preview-card-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <PreviewCardPrimitive.Popup
          className={cn(
            "origin-(--transform-origin) rounded-xl bg-popover p-3 text-foreground shadow-[var(--shadow-border),var(--shadow-lg)] outline-none",
            "transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-out)]",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          data-slot="preview-card-popup"
          {...props}
        >
          {children}
        </PreviewCardPrimitive.Popup>
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { PreviewCardPrimitive };
