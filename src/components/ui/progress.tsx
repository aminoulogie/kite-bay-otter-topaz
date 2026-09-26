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
  // The bar fills with scaleX rather than a width transition: a transform
  // runs on the compositor at the display's refresh rate, while animating
  // width pushes layout through the main thread every frame. Width is fixed
  // at 100% and only the visual scale changes.
  const ratio = Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div
        className={cn(
          "h-full w-full origin-left rounded-full bg-accent transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
          barClassName,
        )}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}
