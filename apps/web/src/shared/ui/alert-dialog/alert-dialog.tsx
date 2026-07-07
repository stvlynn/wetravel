import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { cn } from "@/shared/lib";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogTitle = AlertDialogPrimitive.Title;
export const AlertDialogDescription = AlertDialogPrimitive.Description;
export const AlertDialogClose = AlertDialogPrimitive.Close;

export function AlertDialogPopup({
  children,
  className,
  ...props
}: AlertDialogPrimitive.Popup.Props): React.ReactElement {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-[opacity] duration-[var(--dur-slow)] data-[ending-style]:opacity-0"
        data-slot="alert-dialog-backdrop"
      />
      <AlertDialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 md:p-6">
        <AlertDialogPrimitive.Popup
          className={cn(
            "flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-border),var(--shadow-lg)] outline-none transition-[opacity,scale] duration-[var(--dur-slow)] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          data-slot="alert-dialog-popup"
          {...props}
        >
          {children}
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function AlertDialogFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn("flex items-center justify-end gap-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}
