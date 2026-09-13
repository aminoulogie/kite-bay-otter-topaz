import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TopTab<T extends string> {
  id: T;
  label: string;
}

/**
 * The segmented bar Stats uses, extracted so every page that needs one is the
 * same one.
 *
 * The pill is MEASURED from the selected button rather than derived from its
 * index. Tabs are different widths because labels are different lengths, and
 * once there are more than four the bar scrolls — an index-based pill drifts
 * further from the tab it is meant to be under with every label added.
 */
export function TopTabs<T extends string>({
  tabs, value, onChange, className,
}: {
  tabs: readonly TopTab<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState({ x: 0, w: 0 });

  useEffect(() => {
    const move = () => {
      const el = refs.current[value];
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    };
    move();
    // A second pass after paint: on the first render the fonts may not have
    // settled, and a pill measured against a fallback face lands short.
    const id = requestAnimationFrame(move);
    return () => cancelAnimationFrame(id);
  }, [value, tabs]);

  // The selected tab is scrolled into view, or a bar wider than the screen can
  // leave the current one off the edge with nothing to say which is selected.
  useEffect(() => {
    refs.current[value]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <div
      className={cn(
        "relative flex snap-x gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="tablist"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-1 rounded-full bg-accent transition-[transform,width] duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)]"
        style={{
          width: pill.w,
          height: "calc(100% - 0.5rem)",
          transform: `translateX(${pill.x}px)`,
          opacity: pill.w ? 1 : 0,
        }}
      />
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          onClick={() => onChange(t.id)}
          className={cn(
            "relative z-10 h-10 shrink-0 snap-center rounded-full px-3 text-xs font-bold transition-colors duration-200",
            value === t.id ? "text-accent-ink" : "text-muted",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
