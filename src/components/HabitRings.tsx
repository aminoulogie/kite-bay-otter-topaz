import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { CardTitle } from "@/components/ui/card";
import { dashFor, ringsFor, tally, type HabitRing } from "@/lib/habit-rings";
import { hasDetailRoom, hasFullRoom } from "@/lib/dashboard-layout";
import { addDays, parseLocalDateKey, getLocalDateKey } from "@/lib/soma";
import type { Habit } from "@/lib/types";
import { useWidgetSize } from "@/components/WidgetGrid";
import { Glance, isGlance } from "@/components/Glance";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Today's habits on Home, as a row of rings.
 *
 * **Nothing here is tickable, on purpose.** Home is where you find out how the
 * day is going; Habits is where you change it. Two places to tick the same
 * thing is two places to mis-tap one, and a mis-tap on a habit is not obvious
 * afterwards — the ring just looks done. It also keeps one screen answerable
 * for the day's record, which matters for a checklist habit where a tick is
 * derived from its steps and pressing it directly would be a lie.
 *
 * So the whole card is one button, and it goes to the Habits tab.
 *
 * Rings rather than a checklist because Home has no room for one, and because
 * the shape carries the part-done case a tick cannot: brushing twice of three
 * is a two-thirds ring, and there is no checkbox for that.
 */
export function HabitRings() {
  const habits = useSoma((s) => s.habits);
  const activeDate = useSoma((s) => s.activeDate);
  const setTab = useSoma((s) => s.setTab);
  const size = useWidgetSize();

  const rings = useMemo(() => ringsFor(habits, activeDate), [habits, activeDate]);
  const count = tally(rings);

  if (!habits.length) return null;

  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: "Habits",
          color: "#c8ff2e",
          value: `${count.done}/${count.total}`,
          sub: count.done === count.total ? "all done" : `${count.total - count.done} to go`,
          progress: count.total ? count.done / count.total : null,
          done: count.total > 0 && count.done === count.total,
          lines: rings.map((r) => ({ text: r.name, done: r.fill >= 1 })),
          onOpen: () => setTab("habits"),
        }}
      />
    );
  }

  return (
    // A button wearing the card's clothes rather than a card with a button in
    // it: the whole surface is one target, and there is nothing inside to
    // compete with it because nothing inside is tappable.
    <button
      type="button"
      onClick={() => setTab("habits")}
      className="glass-card block h-full w-full rounded-2xl border border-border bg-surface p-4 text-left active:bg-surface-2"
      aria-label={`Habits: ${count.done} of ${count.total} done. Opens the Habits tab.`}
    >
      <CardTitle>
        <span className="flex items-center gap-1">
          Habits
          <ChevronRight className="size-3.5 text-faint" aria-hidden />
        </span>
        <span className="tabular text-sm font-bold text-accent-text">
          {count.done}/{count.total}
        </span>
      </CardTitle>

      {/* Wraps, so twelve habits become three rows rather than a sideways
          scroll nobody discovers on a card that is not scrollable anywhere
          else. */}
      <div className="flex flex-wrap items-start gap-x-2 gap-y-2.5">
        {rings.map((r) => (
          <Ring key={r.id} ring={r} labelled={hasDetailRoom(size)} />
        ))}
      </div>

      {hasFullRoom(size) && <HabitWeek habits={habits} date={activeDate} />}

      {hasDetailRoom(size) && (
        <p className="mt-2 text-[0.62rem] leading-snug text-faint">
          Read-only. Tick them on the Habits tab, where a part-done checklist can show
          you which step is still missing.
        </p>
      )}
    </button>
  );
}

const R = 13;
const STROKE = 4;
const BOX = (R + STROKE) * 2;

function Ring({ ring, labelled }: { ring: HabitRing; labelled: boolean }) {
  const { length, offset } = dashFor(ring.fill, R);
  const initial = ring.name.trim().slice(0, 1).toUpperCase() || "?";

  // The column is wider than the ring so the name under it has somewhere to
  // go: at the ring's own width every label past four characters became an
  // ellipsis, which tells you nothing about which habit it is.
  return (
    <span className="flex w-14 shrink-0 flex-col items-center gap-1">
      <span className="relative block" style={{ width: BOX, height: BOX }}>
        <svg viewBox={`0 0 ${BOX} ${BOX}`} className="block size-full -rotate-90">
          <circle
            cx={BOX / 2}
            cy={BOX / 2}
            r={R}
            fill="none"
            stroke={ring.color}
            strokeOpacity={0.22}
            strokeWidth={STROKE}
          />
          {/* Drawn only when there is something to draw: a zero-length dash
              with a round cap still paints a dot, which reads as "a bit done"
              on a habit nobody has touched. */}
          {ring.fill > 0 && (
            <circle
              cx={BOX / 2}
              cy={BOX / 2}
              r={R}
              fill="none"
              stroke={ring.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={length}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 260ms cubic-bezier(.2,.8,.2,1)" }}
            />
          )}
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center text-[0.6rem] font-extrabold",
            ring.done ? "text-fg" : "text-faint",
          )}
        >
          {initial}
        </span>
      </span>
      {labelled && (
        <span className="w-full truncate text-center text-[0.5rem] font-bold uppercase tracking-wide text-faint">
          {ring.name}
        </span>
      )}
    </span>
  );
}

/** At the largest size: the last seven days of each habit, a dot a day. */
function HabitWeek({ habits, date }: { habits: Habit[]; date: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(parseLocalDateKey(date), i - 6));
  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
      <div className="flex items-center gap-2 pl-[40%]">
        {days.map((d) => (
          <span key={d.getTime()} className="flex-1 text-center text-[0.55rem] font-bold text-faint">
            {d.toLocaleDateString(undefined, { weekday: "narrow" })}
          </span>
        ))}
      </div>
      {habits.map((h) => {
        const hit = days.filter((d) => h.history?.[getLocalDateKey(d)]).length;
        return (
          <div key={h.id} className="flex items-center gap-2">
            <span className="w-[40%] truncate text-xs font-semibold">
              {h.name}
              <span className="ml-1 text-[0.6rem] tabular text-faint">{hit}/7</span>
            </span>
            {days.map((d) => {
              const done = !!h.history?.[getLocalDateKey(d)];
              return (
                <span key={d.getTime()} className="flex flex-1 justify-center">
                  <span
                    className="size-3.5 rounded-full"
                    style={{ background: done ? h.color : "var(--color-surface-3)" }}
                  />
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
