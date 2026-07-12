import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/shared/lib";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;
export const DrawerTitle = DialogPrimitive.Title;
export const DrawerDescription = DialogPrimitive.Description;

export type DrawerSide = "bottom" | "full";

export interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> {
  side?: DrawerSide;
}

/**
 * Mobile sheet surface: `bottom` slides a rounded panel up from the bottom
 * edge; `full` covers the viewport edge-to-edge. Both pad for device safe
 * areas (requires `viewport-fit=cover`).
 */
export function DrawerContent({
  side = "bottom",
  className,
  children,
  ...props
}: DrawerContentProps): React.ReactElement {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity] duration-[var(--dur-slow)] ease-[var(--ease-out)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
      <DialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden">
        <DialogPrimitive.Popup
          className={cn(
            "flex w-full flex-col overflow-hidden bg-card outline-none transition-[translate] duration-[var(--dur-slow)] ease-[var(--ease-out)] data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
            side === "bottom" &&
              "max-h-[min(85dvh,720px)] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-border),var(--shadow-lg)]",
            side === "full" &&
              "h-dvh rounded-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
            className,
          )}
          {...props}
        >
          {side === "bottom" ? (
            <div aria-hidden className="flex flex-none justify-center pt-2.5 pb-1">
              <div className="h-1 w-9 rounded-full bg-muted" />
            </div>
          ) : null}
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

export function DrawerHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn("flex flex-none flex-col gap-1.5 px-6 pt-2 pb-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function DrawerPanel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        "scrollbar-overlay min-h-0 flex-1 overflow-auto px-6 py-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DrawerFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        "flex flex-none items-center justify-end gap-2 border-t border-border bg-card/50 px-6 pt-3 pb-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
