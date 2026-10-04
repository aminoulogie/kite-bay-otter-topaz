/**
 * Habits as a school report: each one a subject with a coefficient, the day
 * a weighted average.
 *
 * Missing a habit you barely care about (coefficient 1) costs a fifth of what
 * missing the gym (coefficient 5) does — the same way a bad mark in a
 * coefficient-1 subject hardly moves the average and one in a coefficient-5
 * subject sinks it.
 *
 * Which habits count on a day:
 * - not before the habit existed (its first logged day), so adding a habit
 *   today does not rewrite every past day as a miss;
 * - an every-day habit (7 days a week) always counts — missing it is a zero;
 * - a habit asked for fewer days a week counts only on the days it was done.
 *   A rest day from a three-times-a-week habit is the plan, not a miss.
 *
 * A day is "kept" when its score reaches KEEP_AT. The habit streak is a run of
 * kept days, and today never breaks it while it is still going.
 */
import { addDays as addDate, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";
import type { Habit } from "./types.ts";

const addDays = (key: string, n: number) => getLocalDateKey(addDate(parseLocalDateKey(key), n));

export const KEEP_AT = 70;
export const COEF_MIN = 1;
export const COEF_MAX = 5;
/** A habit nobody has rated sits in the middle-low, so 1 still means "barely matters". */
export const COEF_DEFAULT = 2;

export const COEF_LABELS: Record<number, string> = {
  1: "Nice to have",
  2: "Normal",
  3: "Important",
  4: "Very important",
  5: "Essential",
};

export function coefOf(h: Habit): number {
  const c = Math.round(Number(h.coef));
  return Number.isFinite(c) && c >= COEF_MIN && c <= COEF_MAX ? c : COEF_DEFAULT;
}

/** The first day the habit has anything logged — before that it did not exist. */
export function habitStart(h: Habit): string | null {
  const keys = [
    ...Object.keys(h.history ?? {}),
    ...Object.keys(h.amountLog ?? {}),
    ...Object.keys(h.stepLog ?? {}),
  ].filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (h.since) keys.push(h.since);
  if (!keys.length) return null;
  return keys.sort()[0]!;
}

export interface HabitDayRow {
  id: string;
  name: string;
  coef: number;
  done: boolean;
}

export interface HabitDayScore {
  /** 0-100, or null when no habit counted that day. */
  score: number | null;
  earned: number;
  possible: number;
  rows: HabitDayRow[];
}

export function habitDayScore(habits: Habit[], date: string, today = getLocalDateKey(new Date())): HabitDayScore {
  const rows: HabitDayRow[] = [];
  for (const h of habits ?? []) {
    // Never logged and no record of when it was added: it counts from today,
    // so it is a miss today but not on every day before it existed.
    const start = habitStart(h) ?? today;
    if (date < start) continue;
    const done = h.history?.[date] === true;
    const daily = (h.goalDaysPerWeek ?? 7) >= 7;
    if (!daily && !done) continue;
    rows.push({ id: h.id, name: h.name, coef: coefOf(h), done });
  }
  const possible = rows.reduce((t, r) => t + r.coef, 0);
  const earned = rows.reduce((t, r) => t + (r.done ? r.coef : 0), 0);
  return {
    score: possible ? Math.round((earned / possible) * 100) : null,
    earned,
    possible,
    rows,
  };
}

/** Days in a row kept (score ≥ KEEP_AT), ending today — or yesterday while today is still open. */
export function habitStreak(habits: Habit[], today: string): number {
  let d = today;
  const t = habitDayScore(habits, today, today).score;
  if (t == null || t < KEEP_AT) d = addDays(today, -1);
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    const s = habitDayScore(habits, d, today).score;
    if (s == null || s < KEEP_AT) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/**
 * The overall consistency: the average day score over the last `days` days
 * that had something to score. Today is left out until it is kept, so a
 * morning with nothing ticked yet does not drag the number down.
 */
export function habitConsistency(habits: Habit[], today: string, days = 30): number | null {
  const scores: number[] = [];
  const t = habitDayScore(habits, today, today).score;
  if (t != null && t >= KEEP_AT) scores.push(t);
  for (let i = 1; i < days; i++) {
    const s = habitDayScore(habits, addDays(today, -i), today).score;
    if (s != null) scores.push(s);
  }
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
