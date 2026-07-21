import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn, VISUAL_VIEWPORT_FIXED_CLASS } from "@/shared/lib";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogBackdrop = DialogPrimitive.Backdrop;
export const DialogViewport = DialogPrimitive.Viewport;
export const DialogPopup = DialogPrimitive.Popup;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogClose = DialogPrimitive.Close;

/**
 * Responsive dialog viewport: bottom-aligned sheet below `md`, centered
 * card above. Pair with `DialogSheetPopup`.
 *
 * Positioned against the Visual Viewport (`--vv-*` CSS vars) so the sheet
 * stays above the virtual keyboard on engines that only resize the visual
 * viewport (iOS Safari / WeChat WKWebView). See `installVisualViewportCssVars`.
 */
export function DialogSheetViewport({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Viewport>): React.ReactElement {
  return (
    <DialogPrimitive.Viewport
      className={cn(
        VISUAL_VIEWPORT_FIXED_CLASS,
        "z-50 flex items-end justify-center overflow-hidden p-0 md:items-center md:p-6",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Viewport>
  );
}

const SHEET_POPUP_SIZES = {
  sm: "md:max-w-[440px]",
  md: "md:max-w-md",
  lg: "md:max-w-2xl",
} as const;

export interface DialogSheetPopupProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> {
  size?: keyof typeof SHEET_POPUP_SIZES;
}

/**
 * Responsive dialog popup: full-width bottom sheet below `md`, rounded card
 * above. Headers that can reach the top edge should pad with
 * `pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-6`, and footers with the
 * matching safe-area-inset-bottom.
 *
 * `max-h` uses a percentage of the Visual Viewport parent (not bare `dvh`) so
 * the sheet shrinks with the keyboard even when `dvh` is sticky on WebKit.
 */
export function DialogSheetPopup({
  size = "md",
  className,
  children,
  ...props
}: DialogSheetPopupProps): React.ReactElement {
  return (
    <DialogPrimitive.Popup
      className={cn(
        "flex max-h-[min(92%,760px)] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-[var(--shadow-border),var(--shadow-lg)] outline-none transition-[opacity,scale] duration-[var(--dur-slow)] ease-[var(--ease-out)] data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 md:rounded-2xl",
        SHEET_POPUP_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Popup>
  );
}

export function DialogHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn("flex flex-none flex-col gap-1.5 px-6 pt-6 pb-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Scrollable dialog body. On focusin, keeps the focused control visible in
 * the panel scrollport after the Visual Viewport resizes for the keyboard.
 */
export function DialogPanel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !root.contains(target)) return;
      // Wait one frame so --vv-* / layout have applied after focus.
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    };

    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, []);

  return (
    <div
      ref={ref}
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
        "flex flex-none items-center justify-end gap-2 px-6 pb-6 pt-4",
        variant === "default" && "border-t border-border bg-card/50",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
