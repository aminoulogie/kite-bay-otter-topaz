import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div
        className={cn("h-full rounded-full bg-accent transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", barClassName)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
