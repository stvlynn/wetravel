import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/shared/lib";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogBackdrop = DialogPrimitive.Backdrop;
export const DialogViewport = DialogPrimitive.Viewport;
export const DialogPopup = DialogPrimitive.Popup;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogClose = DialogPrimitive.Close;

export function DialogHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn("flex flex-col gap-1.5 px-6 pt-6 pb-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogPanel({
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

export interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "bare";
}

export function DialogFooter({
  className,
  variant = "default",
  children,
  ...props
}: DialogFooterProps): React.ReactElement {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 px-6 pb-6 pt-4",
        variant === "default" && "border-t border-border bg-card/50",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
