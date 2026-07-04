import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-secondary text-muted-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        brand: "bg-brand-muted text-corn-600",
        info: "bg-brand-muted text-corn-600",
        success: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success-foreground",
        warning: "bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning-foreground",
        outline: "border border-border bg-card text-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
