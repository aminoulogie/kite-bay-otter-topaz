import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-border bg-surface p-4 shadow-card", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-3 flex items-center justify-between gap-3 font-display text-base font-bold tracking-tight text-fg",
        className,
      )}
      {...props}
    />
  );
}
