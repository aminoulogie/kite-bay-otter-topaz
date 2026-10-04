import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  barClassName,
  color,
  track,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  /** A CSS background for the fill — a colour or a gradient. Its track is a
   *  faint wash of the same colour when one is given. */
  color?: string;
  /** The track's tint, for a gradient fill that cannot be faded itself. */
  track?: string;
}) {
  // The bar fills with scaleX rather than a width transition: a transform
  // runs on the compositor at the display's refresh rate, while animating
  // width pushes layout through the main thread every frame. Width is fixed
  // at 100% and only the visual scale changes.
  const ratio = Math.max(0, Math.min(100, value)) / 100;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full", !track && "bg-surface-3", className)}
      style={track ? { background: track } : undefined}
    >
      <div
        className={cn(
          "h-full w-full origin-left rounded-full bg-accent transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
          barClassName,
        )}
        style={{ transform: `scaleX(${ratio})`, ...(color ? { background: color } : {}) }}
      />
    </div>
  );
}
