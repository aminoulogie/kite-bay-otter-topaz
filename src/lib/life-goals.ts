/**
 * Goals for the week, the month and the year.
 *
 * A project has steps and a finish line. A goal is smaller and sharper: one
 * thing to have done by the end of a stretch of time — "run 20 km this week",
 * "read two books this month", "bench 100 kg this year". So a goal belongs to
 * a PERIOD, and the period is what gives it its deadline: this week's goals
 * are due on Sunday without anyone typing a date.
 *
 * Two shapes. A plain goal is done or not. A counted goal has a target and a
 * running number ("12 / 20 km"), and is done when the number gets there —
 * progress is something you log, never a percentage you type.
 *
 * Goals nest: a week's goal can say which month or year goal it serves, so a
 * year goal shows the smaller goals feeding it, and a year of weeks adds up
 * to something.
 *
 * A goal left undone when its period ends is not deleted and not quietly
 * rolled forward. It stays in that period, unfinished, and "carry over" moves
 * it into the current one on purpose.
 */
import { addDays, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";

export type Horizon = "week" | "month" | "year";

export interface Goal {
  id: string;
  title: string;
  horizon: Horizon;
  /** "2026-W40", "2026-09" or "2026". */
  period: string;
  /** Present on counted goals: what "done" is. */
  target?: number;
  /** Present on counted goals: how far it has got. */
  progress?: number;
  /** "km", "books", "sessions" — free text, optional. */
  unit?: string;
  /** Done by hand (plain goals) or by reaching the target (counted ones). */
  done: boolean;
  doneAt?: number;
  /** The bigger goal this one serves, if any. */
  parentId?: string;
  color: string;
  createdAt: number;
  /** Where it was carried over from, kept for the record. */
  from?: string;
}

export const GOAL_COLORS = ["#ff9f0a", "#30d158", "#0a84ff", "#bf5af2", "#ff375f", "#64d2ff", "#ffd60a"];

export const HORIZONS: { id: Horizon; label: string; noun: string }[] = [
  { id: "week", label: "This week", noun: "week" },
  { id: "month", label: "This month", noun: "month" },
  { id: "year", label: "This year", noun: "year" },
];

/** ISO week number and its year (which is not always the calendar year). */
function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7) };
}

/** The period a date falls in, for a horizon. */
export function periodOf(horizon: Horizon, date = new Date()): string {
  if (horizon === "year") return String(date.getFullYear());
  if (horizon === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The Monday of an ISO week period. */
function mondayOf(period: string): Date {
  const m = period.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return new Date();
  const year = Number(m[1]);
  const week = Number(m[2]);
  // Jan 4th is always in week 1.
  const jan4 = new Date(year, 0, 4);
  const monday1 = addDays(jan4, -((jan4.getDay() + 6) % 7));
  return addDays(monday1, (week - 1) * 7);
}

/** The first and last day of a period, as date keys. */
export function periodRange(horizon: Horizon, period: string): { from: string; to: string } {
  if (horizon === "week") {
    const mon = mondayOf(period);
    return { from: getLocalDateKey(mon), to: getLocalDateKey(addDays(mon, 6)) };
  }
  if (horizon === "month") {
    const [y, m] = period.split("-").map(Number);
    return {
      from: getLocalDateKey(new Date(y!, m! - 1, 1)),
      to: getLocalDateKey(new Date(y!, m!, 0)),
    };
  }
  return { from: `${period}-01-01`, to: `${period}-12-31` };
}

/** The period before or after, `delta` steps away. */
export function shiftPeriod(horizon: Horizon, period: string, delta: number): string {
  if (horizon === "year") return String(Number(period) + delta);
  if (horizon === "month") {
    const [y, m] = period.split("-").map(Number);
    return periodOf("month", new Date(y!, m! - 1 + delta, 1));
  }
  return periodOf("week", addDays(mondayOf(period), delta * 7));
}

/** "Week 40 · 28 Sep – 4 Oct", "September 2026", "2026". */
export function periodLabel(horizon: Horizon, period: string): string {
  if (horizon === "year") return period;
  if (horizon === "month") {
    const [y, m] = period.split("-").map(Number);
    return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const { from, to } = periodRange("week", period);
  const f = parseLocalDateKey(from);
  const t = parseLocalDateKey(to);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `Week ${Number(period.slice(-2))} · ${fmt(f)} – ${fmt(t)}`;
}

/** Days left in a period, counting today; 0 once it is over. */
export function daysLeftIn(horizon: Horizon, period: string, today = new Date()): number {
  const { to } = periodRange(horizon, period);
  const end = parseLocalDateKey(to).getTime();
  const now = parseLocalDateKey(getLocalDateKey(today)).getTime();
  return Math.max(0, Math.round((end - now) / 86400000) + 1);
}

/** Where a goal stands, 0 to 1. A plain goal is all or nothing. */
export function goalProgress(g: Goal): number {
  if (g.target && g.target > 0) return Math.max(0, Math.min(1, (g.progress ?? 0) / g.target));
  return g.done ? 1 : 0;
}

/** Logging towards a counted goal; it completes itself when it gets there. */
export function logProgress(g: Goal, amount: number, now = Date.now()): Goal {
  const progress = Math.max(0, Math.round(((g.progress ?? 0) + amount) * 100) / 100);
  const done = !!g.target && progress >= g.target;
  return { ...g, progress, done, doneAt: done ? (g.done ? g.doneAt : now) : undefined };
}

/** True once a goal's period is over. Periods are zero-padded, so they sort as text. */
export function isPast(g: Goal, today = new Date()): boolean {
  return g.period < periodOf(g.horizon, today);
}

/** A goal from an earlier period, moved into the current one on purpose. */
export function carryOver(g: Goal, today = new Date()): Goal {
  return { ...g, period: periodOf(g.horizon, today), from: g.from ?? g.period };
}

/** The goals a bigger goal is served by. */
export function childrenOf(goals: readonly Goal[], id: string): Goal[] {
  return goals.filter((g) => g.parentId === id);
}

/** What a goal can serve: only bigger horizons. */
export function parentsFor(horizon: Horizon): Horizon[] {
  if (horizon === "week") return ["month", "year"];
  if (horizon === "month") return ["year"];
  return [];
}

export interface PeriodSummary {
  total: number;
  done: number;
  /** Average progress across the period's goals, 0 to 1. */
  progress: number;
}

export function summarisePeriod(goals: readonly Goal[], horizon: Horizon, period: string): PeriodSummary {
  const list = goals.filter((g) => g.horizon === horizon && g.period === period);
  if (!list.length) return { total: 0, done: 0, progress: 0 };
  return {
    total: list.length,
    done: list.filter((g) => g.done).length,
    progress: list.reduce((a, g) => a + goalProgress(g), 0) / list.length,
  };
}

/** A goals list read back from storage or a backup, repaired field by field. */
export function asGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  const out: Goal[] = [];
  for (const r of raw as Partial<Goal>[]) {
    if (!r || typeof r.id !== "string" || typeof r.title !== "string") continue;
    const horizon: Horizon = r.horizon === "month" || r.horizon === "year" ? r.horizon : "week";
    out.push({
      id: r.id,
      title: r.title,
      horizon,
      period: typeof r.period === "string" ? r.period : periodOf(horizon),
      target: Number(r.target) > 0 ? Number(r.target) : undefined,
      progress: Number(r.progress) >= 0 ? Number(r.progress) : undefined,
      unit: typeof r.unit === "string" && r.unit ? r.unit : undefined,
      done: !!r.done,
      doneAt: typeof r.doneAt === "number" ? r.doneAt : undefined,
      parentId: typeof r.parentId === "string" ? r.parentId : undefined,
      color: typeof r.color === "string" ? r.color : GOAL_COLORS[0]!,
      createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
      from: typeof r.from === "string" ? r.from : undefined,
    });
  }
  return out;
}
