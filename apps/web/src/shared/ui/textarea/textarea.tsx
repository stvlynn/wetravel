import { forwardRef } from "react";
import { cn, field } from "@/shared/lib";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Multi-line text control matching the Input treatment (no focus glow;
 * feedback via border/background). */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        data-slot="textarea"
        className={cn(
          "w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground min-h-10",
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
  },
);
