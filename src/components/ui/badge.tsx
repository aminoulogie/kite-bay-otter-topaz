import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "muted" | "accent" | "warn" | "danger" | "good";
}) {
  const tones = {
    muted: "bg-surface-2 text-muted border-border",
    accent: "bg-accent-soft text-accent-text border-accent-line",
    warn: "bg-warn/15 text-warn border-warn/30",
    danger: "bg-danger/15 text-danger border-danger/30",
    good: "bg-good/15 text-good border-good/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
