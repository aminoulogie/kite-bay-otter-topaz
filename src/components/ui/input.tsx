import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-medium placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
