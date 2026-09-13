/**
 * Habits that move a little every day.
 *
 * Two shapes, one mechanism. Building: read one minute today, two tomorrow,
 * until thirty is ordinary. Quitting: two hours today, one fifty-nine tomorrow,
 * a minute less each day until there is nothing left to cut. The number is the
 * same number running in opposite directions, so there is one set of rules
 * here and not two.
 *
 * The decision that matters most is what happens on a day you miss, and it is
 * the one a naive version gets wrong. If the ladder is tied to the CALENDAR, a
 * fortnight away puts tomorrow's rung fourteen steps beyond where you actually
 * are, and the thing you built to help now just documents how far behind you
 * fell. For a habit someone has been fighting for years that is not a rounding
 * error, it is the whole difference between a tool and another reason to feel
 * bad.
 *
 * So the default is EARNED: the rung only moves on days you actually made it.
 * Miss one and the ladder waits where it is. The calendar mode exists for
 * people who want the pressure, and it is opt-in.
 *
 * Two smaller rules follow from the same thinking:
 *
 * **A bad day never pushes the target back up.** Ground taken is kept. A ladder
 * that retreats when you slip can be climbed forever without arriving.
 *
 * **A day with nothing logged is not a failure, it is a blank.** It does not
 * advance the ramp and it does not tick the habit. Silence is not a verdict.
 */

import { addDays, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";
import type { Habit } from "./types.ts";

export type RampUnit = "min" | "count" | "page";

/** How the rung moves: only on days you made it, or every day regardless. */
export type RampAdvance = "earned" | "calendar";

export interface HabitRamp {
  /** Where day one sits. */
  start: number;
  /** Where it is going. Above start builds; below start quits. */
  target: number;
  /** How far it moves in a day. Always positive — direction comes from target. */
  step: number;
  /** First day of the ramp, as a local date key. */
  from: string;
  unit: RampUnit;
  advance: RampAdvance;
}

/** Nothing here should produce an absurd ladder from a typo. */
export const MAX_VALUE = 100_000;

export function clampValue(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(MAX_VALUE, Math.round(v));
}

/** Building up to something, rather than cutting down to it. */
export function isBuild(ramp: HabitRamp): boolean {
  return ramp.target >= ramp.start;
}

/** Whole days from one date key to another. Negative when b is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = parseLocalDateKey(from).getTime();
  const b = parseLocalDateKey(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Did a given day's number satisfy the rung?
 *
 * Building, the number is a FLOOR you reach. Quitting, it is a CEILING you stay
 * under — which is why a quit habit can be satisfied by zero and a build habit
 * cannot.
 */
export function meets(ramp: HabitRamp, rung: number, value: number | undefined): boolean {
  if (value === undefined || !Number.isFinite(value)) return false;
  return isBuild(ramp) ? value >= rung : value <= rung;
}

/** The rung after n advances, never past the target. */
export function rungAfter(ramp: HabitRamp, advances: number): number {
  const n = Math.max(0, Math.floor(Number(advances) || 0));
  const step = Math.abs(Number(ramp.step) || 0);
  const moved = isBuild(ramp) ? ramp.start + step * n : ramp.start - step * n;
  return isBuild(ramp)
    ? Math.min(ramp.target, moved)
    : Math.max(ramp.target, moved);
}

export type AmountLog = Record<string, number>;

/**
 * What today asks for.
 *
 * In earned mode this counts the days BEFORE this one that were actually made,
 * so the ladder is a record of progress rather than of elapsed time. In
 * calendar mode it is simply how many days have passed.
 */
export function rungOn(ramp: HabitRamp, date: string, log: AmountLog | undefined): number {
  if (!ramp) return 0;
  const elapsed = daysBetween(ramp.from, date);
  if (elapsed <= 0) return ramp.start;

  if (ramp.advance === "calendar") return rungAfter(ramp, elapsed);

  let earned = 0;
  for (let i = 0; i < elapsed; i++) {
    const key = getLocalDateKey(addDays(parseLocalDateKey(ramp.from), i));
    // Each earlier day is judged against the rung it actually faced, which is
    // the one set by the days earned before IT.
    if (meets(ramp, rungAfter(ramp, earned), log?.[key])) earned++;
  }
  return rungAfter(ramp, earned);
}

/** True once the ramp has nothing left to give. */
export function atGoal(ramp: HabitRamp, rung: number): boolean {
  return isBuild(ramp) ? rung >= ramp.target : rung <= ramp.target;
}

export interface RampStatus {
  /** What today asks for. */
  rung: number;
  /** What was logged today, or undefined when the day is still blank. */
  logged: number | undefined;
  done: boolean;
  /** Days already earned, and how many the whole climb takes. */
  earned: number;
  total: number;
  /** True when the rung has reached the target. */
  finished: boolean;
}

export function totalRungs(ramp: HabitRamp): number {
  const step = Math.abs(Number(ramp.step) || 0);
  if (step <= 0) return 0;
  return Math.ceil(Math.abs(ramp.target - ramp.start) / step);
}

export function status(ramp: HabitRamp, date: string, log: AmountLog | undefined): RampStatus {
  const rung = rungOn(ramp, date, log);
  const logged = log?.[date];
  const step = Math.abs(Number(ramp.step) || 0);
  const moved = Math.abs(rung - ramp.start);
  return {
    rung,
    logged: Number.isFinite(logged) ? logged : undefined,
    done: meets(ramp, rung, logged),
    earned: step > 0 ? Math.round(moved / step) : 0,
    total: totalRungs(ramp),
    finished: atGoal(ramp, rung),
  };
}

/**
 * The earliest the climb can finish, counting from a given day.
 *
 * Only honest in calendar mode, where days and rungs are the same thing. In
 * earned mode it is the best case — every remaining day made — and is labelled
 * that way rather than presented as a date.
 */
export function daysRemaining(ramp: HabitRamp, date: string, log: AmountLog | undefined): number {
  const s = status(ramp, date, log);
  return Math.max(0, s.total - s.earned);
}

export function goalDate(ramp: HabitRamp, date: string, log: AmountLog | undefined): string {
  return getLocalDateKey(addDays(parseLocalDateKey(date), daysRemaining(ramp, date, log)));
}

/** "1h 59m", "12 pages", "30". */
export function formatAmount(value: number, unit: RampUnit): string {
  const n = clampValue(value);
  if (unit === "min") {
    const h = Math.floor(n / 60);
    const m = n % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }
  if (unit === "page") return `${n} ${n === 1 ? "page" : "pages"}`;
  return String(n);
}

/** How today's rung reads on the card. */
export function rungLabel(ramp: HabitRamp, rung: number): string {
  const amount = formatAmount(rung, ramp.unit);
  return isBuild(ramp) ? `${amount} or more` : `${amount} or less`;
}

/** Sensible increments for the logger's buttons, per unit. */
export function bumpSizes(unit: RampUnit): number[] {
  if (unit === "min") return [1, 5, 15];
  if (unit === "page") return [1, 5, 10];
  return [1, 5, 10];
}

/**
 * The two the app ships with, because they are the two that were asked for and
 * both are exactly what a ramp is good at.
 */
export const RAMP_PRESETS: {
  name: string;
  desc: string;
  color: string;
  ramp: Omit<HabitRamp, "from">;
}[] = [
  {
    name: "Read",
    desc: "One minute more every day, up to thirty",
    color: "#f0a63c",
    ramp: { start: 1, target: 30, step: 1, unit: "min", advance: "earned" },
  },
  {
    name: "Daydreaming",
    desc: "One minute less every day, down to none",
    color: "#9b7bf0",
    ramp: { start: 120, target: 0, step: 1, unit: "min", advance: "earned" },
  },
];

/**
 * Re-derive the habit's day-marks from its ramp log.
 *
 * Every logged date, not just the one that changed: in earned mode a rung
 * depends on the days before it, so correcting last Tuesday changes what
 * Wednesday was asking for. Recomputing the lot is a few hundred numbers and
 * removes a whole class of quietly-wrong history.
 */
export function syncRampHistory(habit: Habit): Habit {
  const ramp = habit.ramp;
  const log = habit.amountLog;
  if (!ramp || !log) return habit;

  const history = { ...habit.history };
  let changed = false;
  for (const date of Object.keys(log)) {
    const done = status(ramp, date, log).done;
    if (!!history[date] === done) continue;
    history[date] = done;
    changed = true;
  }
  return changed ? { ...habit, history } : habit;
}

/** Record an amount for a day. Zero is a real value and is kept as one. */
export function logAmount(habit: Habit, date: string, value: number | null): Habit {
  const log = { ...(habit.amountLog ?? {}) };
  if (value === null) delete log[date];
  else log[date] = clampValue(value);
  return syncRampHistory({ ...habit, amountLog: log });
}

/** Attach, replace or remove a ramp. Removing keeps the days already earned. */
export function setRamp(habit: Habit, ramp: HabitRamp | null): Habit {
  if (!ramp) {
    const { ramp: _r, amountLog: _a, ...rest } = habit;
    return rest as Habit;
  }
  return syncRampHistory({
    ...habit,
    ramp: {
      ...ramp,
      start: clampValue(ramp.start),
      target: clampValue(ramp.target),
      step: Math.max(0, clampValue(ramp.step)),
    },
  });
}
