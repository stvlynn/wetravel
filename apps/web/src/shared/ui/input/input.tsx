import { forwardRef } from "react";
import { cn, field } from "@/shared/lib";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground",
        "placeholder:text-muted-foreground/70",
        field,
        "outline-none hover:border-ring/50 hover:bg-accent/40",
        "focus:border-ring focus:bg-background focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
