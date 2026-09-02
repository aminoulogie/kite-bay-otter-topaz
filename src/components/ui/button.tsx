import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-transform duration-150 ease-out disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98] cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-fg border border-border hover:border-border-strong",
        primary: "bg-accent text-accent-ink border border-accent shadow-glow font-bold",
        ghost: "bg-transparent text-muted hover:text-fg hover:bg-surface-2",
        danger: "bg-danger/15 text-danger border border-danger/40",
        outline: "bg-transparent border border-border text-fg hover:border-border-strong",
      },
      size: {
        sm: "h-9 px-3 text-xs rounded-lg",
        md: "h-11 px-4 text-sm rounded-xl",
        lg: "h-12 px-5 text-sm rounded-xl",
        icon: "size-10 rounded-xl",
        pill: "h-9 px-3.5 text-xs rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
