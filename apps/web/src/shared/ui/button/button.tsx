import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, interactive } from "@/shared/lib";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none " +
    `${interactive} outline-none ` +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        brand: "bg-brand text-brand-foreground shadow-xs hover:bg-brand/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent",
        outline:
          "border border-border bg-card text-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs relative after:absolute after:-inset-1 after:content-['']",
        md: "h-9 rounded-lg px-4 text-sm relative after:absolute after:-inset-0.5 after:content-['']",
        lg: "h-10 rounded-lg px-5 text-sm",
        icon: "size-10 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  static?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, static: isStatic, type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          buttonVariants({ variant, size }),
          isStatic && "active:scale-100",
          className,
        )}
        {...props}
      />
    );
  },
);
