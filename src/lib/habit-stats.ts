/**
 * The numbers on a habit's own page: streaks, completion, the year grid and
 * the frequency bars. Pure, so the panel only draws.
 */

import { addDays, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";
import { habitStart } from "./habit-score.ts";
import type { Habit } from "./types.ts";

const done = (h: Habit, d: string) => h.history?.[d] === true;

/**
 * The run of done days ending today, or yesterday while today is still open:
 * an unticked morning is not a broken streak.
 */
export function currentStreak(h: Habit, today: string): number {
  let cursor = parseLocalDateKey(today);
  if (!done(h, today)) cursor = addDays(cursor, -1);
  let n = 0;
  while (done(h, getLocalDateKey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestStreak(h: Habit): number {
  const days = Object.keys(h.history ?? {}).filter((d) => done(h, d)).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && getLocalDateKey(addDays(parseLocalDateKey(prev), 1)) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function totalDays(h: Habit): number {
  return Object.keys(h.history ?? {}).filter((d) => done(h, d)).length;
}

/** Done days over days since it started, today included. Null before it starts. */
export function completionRate(h: Habit, today: string): number | null {
  const start = habitStart(h);
  if (!start || start > today) return null;
  const span =
    Math.round((parseLocalDateKey(today).getTime() - parseLocalDateKey(start).getTime()) / 86_400_000) + 1;
  const n = Object.keys(h.history ?? {}).filter((d) => done(h, d) && d >= start && d <= today).length;
  return Math.round((n / Math.max(1, span)) * 100);
}

/** Monday on or before the date. */
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/**
 * Weeks as columns of seven dates, Monday on top, ending with the week that
 * holds `today`. Days after today are null.
 */
export function recentWeeks(today: string, weeks: number): (string | null)[][] {
  const end = parseLocalDateKey(today);
  const first = addDays(mondayOf(end), -7 * (weeks - 1));
  const cols: (string | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: (string | null)[] = [];
    for (let r = 0; r < 7; r++) {
      const d = addDays(first, w * 7 + r);
      col.push(d > end ? null : getLocalDateKey(d));
    }
    cols.push(col);
  }
  return cols;
}

/**
 * A calendar year as Monday-first week columns. Cells outside the year are
 * null; `months` gives the column each month starts in, for the labels.
 */
export function yearWeeks(year: number): { cols: (string | null)[][]; months: { col: number; label: string }[] } {
  const jan1 = new Date(year, 0, 1);
  const start = mondayOf(jan1);
  const cols: (string | null)[][] = [];
  const months: { col: number; label: string }[] = [];
  for (let w = 0; ; w++) {
    const col: (string | null)[] = [];
    for (let r = 0; r < 7; r++) {
      const d = addDays(start, w * 7 + r);
      if (d.getFullYear() !== year) {
        col.push(null);
        continue;
      }
      col.push(getLocalDateKey(d));
      if (d.getDate() === 1) {
        months.push({ col: w, label: d.toLocaleDateString("en", { month: "short" }) });
      }
    }
    if (col.every((c) => c === null)) break;
    cols.push(col);
  }
  return { cols, months };
}

export type FrequencyMode = "weekly" | "monthly" | "yearly";

export interface Bar {
  label: string;
  value: number;
  /** The most it could have been, so a bar reads against its own ceiling. */
  max: number;
}

/**
 * Weekly: the last twelve weeks, out of seven. Monthly: the twelve months of
 * `year`, out of the month's length. Yearly: every year since it started.
 */
export function frequency(h: Habit, mode: FrequencyMode, year: number, today: string): Bar[] {
  const t = parseLocalDateKey(today);
  if (mode === "weekly") {
    return recentWeeks(today, 12).map((col) => ({
      label: col[0]!.slice(8, 10).replace(/^0/, "") + "/" + col[0]!.slice(5, 7).replace(/^0/, ""),
      value: col.filter((d) => d && done(h, d)).length,
      max: 7,
    }));
  }
  if (mode === "monthly") {
    return Array.from({ length: 12 }, (_, m) => {
      const len = new Date(year, m + 1, 0).getDate();
      const prefix = `${year}-${String(m + 1).padStart(2, "0")}-`;
      let value = 0;
      for (let d = 1; d <= len; d++) if (done(h, prefix + String(d).padStart(2, "0"))) value++;
      return { label: new Date(year, m, 1).toLocaleDateString("en", { month: "narrow" }), value, max: len };
    });
  }
  const start = habitStart(h);
  const from = Math.min(start ? Number(start.slice(0, 4)) : t.getFullYear(), t.getFullYear());
  const out: Bar[] = [];
  for (let y = from; y <= t.getFullYear(); y++) {
    const value = Object.keys(h.history ?? {}).filter((d) => done(h, d) && d.startsWith(`${y}-`)).length;
    const leap = new Date(y, 1, 29).getMonth() === 1;
    out.push({ label: String(y), value, max: leap ? 366 : 365 });
  }
  return out;
}
