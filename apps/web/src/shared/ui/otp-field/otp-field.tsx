import { OTPField as OTPFieldPrimitive } from "@base-ui/react/otp-field";
import type * as React from "react";
import { cn } from "@/shared/lib";

export function OTPField({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof OTPFieldPrimitive.Root> & {
  size?: "default" | "lg";
}): React.ReactElement {
  return (
    <OTPFieldPrimitive.Root
      className={cn(
        "flex items-center justify-center gap-2 has-disabled:opacity-64",
        className,
      )}
      data-size={size}
      data-slot="otp-field"
      {...props}
    />
  );
}

export function OTPFieldInput({
  className,
  ...props
}: React.ComponentProps<typeof OTPFieldPrimitive.Input>): React.ReactElement {
  return (
    <OTPFieldPrimitive.Input
      className={cn(
        // Both sizes hold 16px below md: iOS Safari auto-zooms the page when
        // focusing a text control whose font-size is smaller than 16px.
        "relative size-10 min-w-0 rounded-lg border border-input bg-card text-center text-md leading-10 text-foreground",
        "md:in-[[data-slot=otp-field][data-size=lg]]:text-base",
        "in-[[data-slot=otp-field][data-size=default]]:size-9 in-[[data-slot=otp-field][data-size=default]]:leading-9 md:in-[[data-slot=otp-field][data-size=default]]:text-sm",
        "shadow-xs outline-none transition-[border-color,box-shadow,background-color,scale] duration-[var(--dur-base)] ease-[var(--ease-out)]",
        "hover:border-ring/50 hover:bg-accent/40",
        "focus-visible:z-10 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/24",
        "aria-invalid:border-destructive/36 aria-invalid:focus-visible:border-destructive/64 aria-invalid:focus-visible:ring-destructive/16",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      data-slot="otp-field-input"
      spellCheck={false}
      {...props}
    />
  );
}

export function OTPFieldSeparator({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      aria-hidden
      className={cn("px-0.5 text-sm text-muted-foreground", className)}
      data-slot="otp-field-separator"
      {...props}
    >
      –
    </div>
  );
}
