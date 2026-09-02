/**
 * The habit heatmaps, ported from the Obsidian plugin's habit tracker.
 *
 * Geometry is deliberately identical to the plugin's CSS rather than
 * reinterpreted: the month matrix is 7 columns with a 6px gap on a 12px
 * padded surface, and the year grid is 52 columns of 7 rows at 11px with a
 * 3px gap, flowing down-then-across. Those numbers are the design — a "nicer"
 * responsive grid stops being the map the user built.
 *
 * Colour rules also follow the plugin: a completed day in the month matrix
 * takes the HABIT's own colour, while the year grid uses the theme accent at
 * an opacity floor of 0.35 so a single completion is still visible.
 */

import { addDays, getLocalDateKey } from "@/lib/soma";
import type { Habit } from "@/lib/types";

const MONTH_DAYS = 28;
const YEAR_WEEKS = 52;

/** 28-day activity matrix for one habit. Click a pixel to toggle that day. */
export function MonthMatrix({
  habit,
  onToggle,
}: {
  habit: Habit;
  onToggle: (date: string) => void;
}) {
  const today = new Date();
  const cells = [];

  for (let i = MONTH_DAYS - 1; i >= 0; i--) {
    const dStr = getLocalDateKey(addDays(today, -i));
    const done = habit.history[dStr] === true;
    cells.push(
      <button
        key={dStr}
        type="button"
        onClick={() => onToggle(dStr)}
        title={`${dStr}: ${done ? "Completed" : "Incomplete"}`}
        aria-label={`${dStr} ${done ? "completed" : "incomplete"}`}
        className="aspect-square rounded-[5px] transition-transform active:scale-90"
        style={{ background: done ? habit.color : "var(--color-surface-2)" }}
      />,
    );
  }

  return (
    <div
      className="grid grid-cols-7 rounded-[14px] bg-surface p-3"
      style={{ gap: "6px" }}
    >
      {cells}
    </div>
  );
}

/**
 * One 52-week square map. `intensityFor` returns 0..1 for a date key.
 * Scrolls horizontally rather than shrinking — the cell size is fixed at
 * 11px, as in the plugin, so a year always reads at the same density.
 */
export function YearGrid({
  intensityFor,
  titleFor,
}: {
  intensityFor: (date: string) => number;
  titleFor: (date: string, intensity: number) => string;
}) {
  const today = new Date();
  const totalDays = YEAR_WEEKS * 7;
  const start = addDays(today, -totalDays + 1);
  const cells = [];

  for (let i = 0; i < totalDays; i++) {
    const dStr = getLocalDateKey(addDays(start, i));
    const intensity = intensityFor(dStr);
    cells.push(
      <div
        key={dStr}
        title={titleFor(dStr, intensity)}
        className="size-[11px] rounded-[2px]"
        style={
          intensity > 0
            ? {
                background: "var(--color-accent)",
                opacity: Math.max(intensity, 0.35),
              }
            : { background: "var(--color-surface-2)" }
        }
      />,
    );
  }

  return (
    <div
      className="soma-scroll grid overflow-x-auto pb-0.5"
      style={{
        gridAutoFlow: "column",
        gridTemplateRows: "repeat(7, 11px)",
        gridAutoColumns: "11px",
        gap: "3px",
      }}
    >
      {cells}
    </div>
  );
}

/** A titled year block, matching the plugin's head/sub layout. */
export function YearBlock({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-3 first:pt-0.5 last:border-0 last:pb-0.5">
      <div className="mb-[7px] flex items-baseline justify-between gap-2.5">
        <span className="text-[0.82rem] font-extrabold tracking-tight text-fg">{title}</span>
        <span className="whitespace-nowrap text-[0.66rem] font-bold uppercase tracking-[0.06em] text-faint">
          {sub}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Every habit stacked into one map, then one map per habit. */
export function YearlyOverview({ habits }: { habits: Habit[] }) {
  if (!habits.length) {
    return (
      <p className="py-4 text-center text-xs text-faint">
        Add a habit and its own yearly map appears here.
      </p>
    );
  }

  const doneCount = (date: string) =>
    habits.filter((h) => h.history?.[date] === true).length;

  return (
    <div className="rounded-[18px] border border-border bg-surface p-4">
      <YearBlock title="All Habits" sub={`${habits.length} tracked`}>
        <YearGrid
          intensityFor={(d) => Math.min(doneCount(d) / habits.length, 1)}
          titleFor={(d) => `${d} — ${doneCount(d)}/${habits.length} habits`}
        />
      </YearBlock>

      {habits.map((h) => {
        const done = Object.values(h.history || {}).filter((v) => v === true).length;
        return (
          <YearBlock key={h.id} title={h.name} sub={`${done} day${done === 1 ? "" : "s"}`}>
            <YearGrid
              intensityFor={(d) => (h.history?.[d] === true ? 1 : 0)}
              titleFor={(d, on) => `${h.name} — ${d} — ${on ? "done" : "not logged"}`}
            />
          </YearBlock>
        );
      })}
    </div>
  );
}
