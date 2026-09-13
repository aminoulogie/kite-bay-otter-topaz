import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TopTab<T extends string> {
  id: T;
  label: string;
  /** Optional, for bars that carried icons before this component existed. */
  icon?: LucideIcon;
}

/**
 * The segmented bar every page with sub-pages uses.
 *
 * There were three of these — this one, Body's, and Habits' — and they had
 * drifted into three different heights, three different alignments and two
 * different ideas of what a selected tab looks like. One implementation is the
 * only way that stays fixed.
 *
 * **The tabs share the bar equally when they fit.** `flex: 1 1 0` with a
 * `min-width` of their own text: with room, four tabs are four equal quarters,
 * which is symmetrical and centred without `justify-content` — and centring
 * with `justify-content` is what would break, because a centred flex row that
 * overflows clips its own first item and puts it out of reach. Once there are
 * too many to fit (Stats has eight) each falls back to its natural width and
 * the bar scrolls, which is the only honest thing a bar can do at that point.
 *
 * **The pill is MEASURED from the selected button** rather than derived from
 * its index. Tabs are different widths once the bar scrolls, and an
 * index-based pill drifts further from the tab it is meant to be under with
 * every label added.
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
            // basis-0 so the share is equal rather than proportional to the
            // label, min-w-max so a long one is never squeezed to an ellipsis.
            "relative z-10 flex h-10 min-w-max flex-1 basis-0 snap-center items-center justify-center gap-1.5 rounded-full px-2 text-xs font-bold transition-colors duration-200",
            value === t.id ? "text-accent-ink" : "text-muted",
          )}
        >
          {t.icon ? <t.icon className="size-3.5 shrink-0" /> : null}
          {t.label}
        </button>
      ))}
    </div>
  );
}
