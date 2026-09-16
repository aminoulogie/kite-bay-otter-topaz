/**
 * Minutes read, against a goal, against a streak.
 *
 * The shelf answers "what am I reading". This answers the question that
 * actually decides whether a book gets finished, which is "did I open it
 * today" — and a run of days you can see is most of what makes you open it
 * tomorrow.
 *
 * The minutes arrive three ways. A book open in SOMA counts itself — see
 * `reading-clock.ts` — and a timer you start by hand or a tap on +15 covers
 * everything read on paper, which is most of what anybody reads.
 *
 * Because two of those three depend on somebody remembering, one rule is
 * unavoidable and it is the rule everything else here bends around: **a day
 * with nothing logged is a day with nothing logged, not a day with zero
 * minutes.** A streak may only be broken by a day that went by, never by a day
 * nobody got round to recording — but a blank day cannot count towards one
 * either. Both halves matter, and the second is why the streak walks backwards
 * from today rather than counting entries.
 */

import { addDays, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";

/** What Apple starts people on, and a defensible default. */
export const DEFAULT_GOAL_MIN = 30;

/** Books a year, for the grid. Not a target anyone has to accept. */
export const DEFAULT_BOOKS_PER_YEAR = 12;

/** A timer left running longer than this was forgotten, not read. */
export const MAX_SESSION_MIN = 8 * 60;

/** A day cannot hold more reading than it holds hours. */
export const MAX_DAY_MIN = 24 * 60;

export type ReadingLog = Record<string, number>;

export function clampMinutes(n: number, max = MAX_DAY_MIN): number {
  const v = Math.round(Number(n) || 0);
  return Math.min(max, Math.max(0, v));
}

export function minutesOn(log: ReadingLog | undefined, date: string): number {
  const n = log?.[date];
  return Number.isFinite(n) ? clampMinutes(n as number) : 0;
}

/** Whether a day was logged at all — distinct from having been logged as zero. */
export function wasLogged(log: ReadingLog | undefined, date: string): boolean {
  return Number.isFinite(log?.[date]);
}

export function metOn(log: ReadingLog | undefined, date: string, goal: number): boolean {
  const g = Math.max(1, clampMinutes(goal || DEFAULT_GOAL_MIN));
  return minutesOn(log, date) >= g;
}

/**
 * Minutes elapsed on a running timer, capped.
 *
 * The cap is not tidiness. A timer started at bedtime and found in the morning
 * would otherwise hand you nine hours of reading and a streak you did not
 * earn, and a tracker that inflates on your behalf is worse than one that
 * misses a day.
 */
export function elapsedMinutes(since: number | null | undefined, now = Date.now()): number {
  if (!since || !Number.isFinite(since)) return 0;
  const mins = (now - since) / 60_000;
  if (mins <= 0) return 0;
  return Math.min(MAX_SESSION_MIN, Math.floor(mins));
}

/** What today shows: what is banked, plus whatever the timer is holding. */
export function todayMinutes(
  log: ReadingLog | undefined,
  date: string,
  since: number | null | undefined,
  now = Date.now(),
): number {
  return clampMinutes(minutesOn(log, date) + elapsedMinutes(since, now));
}

/**
 * Days in a row ending today.
 *
 * Today not being met yet does not break a run — the day is not over. So the
 * walk starts at today when today is met and at yesterday when it is not,
 * which is the same rule the habit streaks use.
 */
export function streak(log: ReadingLog | undefined, goal: number, today: string): number {
  let n = 0;
  let cursor = metOn(log, today, goal) ? parseLocalDateKey(today) : addDays(parseLocalDateKey(today), -1);
  while (metOn(log, getLocalDateKey(cursor), goal)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** The longest run ever recorded, for the line that says a record was beaten. */
export function bestStreak(log: ReadingLog | undefined, goal: number): number {
  const days = Object.keys(log ?? {})
    .filter((d) => metOn(log, d, goal))
    .sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    const expected = prev ? getLocalDateKey(addDays(parseLocalDateKey(prev), 1)) : null;
    run = expected === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

export interface WeekDay {
  date: string;
  /** "M", "T", … in the viewer's own locale. */
  letter: string;
  minutes: number;
  met: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * The seven circles, Monday to Sunday, for the week `today` falls in.
 *
 * The week rather than the last seven days: a strip that slides every midnight
 * cannot show "this week", and "this week" is what a weekly goal is measured
 * against.
 */
export function weekOf(
  log: ReadingLog | undefined,
  goal: number,
  today: string,
  locale?: string,
): WeekDay[] {
  const base = parseLocalDateKey(today);
  // getDay() is 0 for Sunday; shift so Monday starts the row.
  const offset = (base.getDay() + 6) % 7;
  const monday = addDays(base, -offset);

  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const date = getLocalDateKey(d);
    return {
      date,
      letter: d.toLocaleDateString(locale, { weekday: "narrow" }),
      minutes: minutesOn(log, date),
      met: metOn(log, date, goal),
      isToday: date === today,
      isFuture: date > today,
    };
  });
}

/** Days this week that hit the goal. */
export function weekMet(week: WeekDay[]): number {
  return week.filter((d) => d.met).length;
}

// ------------------------------------------------------------------- arc --

/** Degrees the dial sweeps, centred on the top, with a gap at the bottom. */
export const ARC_SWEEP = 220;
export const ARC_START = -ARC_SWEEP / 2;

/** 0 to 1, never past either end however far over the goal you went. */
export function fractionOf(minutes: number, goal: number): number {
  const g = Math.max(1, clampMinutes(goal || DEFAULT_GOAL_MIN));
  return Math.max(0, Math.min(1, clampMinutes(minutes) / g));
}

/** A point on the dial. 0° is the top, degrees run clockwise. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * An open arc, for stroking.
 *
 * A zero-length sweep returns nothing rather than a degenerate path: an arc
 * whose ends coincide renders as either a dot or an entire circle depending on
 * the engine, and neither is "no progress".
 */
export function arcD(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const sweep = toDeg - fromDeg;
  if (!(sweep > 0.01)) return "";
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, Math.min(toDeg, fromDeg + 359.99));
  const large = sweep > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** "0:00", "12:30" — the dial's own readout, minutes as hours and minutes. */
export function clockOf(minutes: number): string {
  const m = clampMinutes(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

// ----------------------------------------------------------------- books --

export interface BookGrid {
  cells: { n: number; done: boolean }[];
  finished: number;
  goal: number;
}

/**
 * The numbered grid of books finished this year.
 *
 * It grows past the goal rather than stopping at it. Reading fifteen against a
 * target of twelve is the good case, and a grid that cannot show the
 * fifteenth is a grid that punishes it.
 */
export function bookGrid(finished: number, goal: number): BookGrid {
  const g = Math.max(1, Math.min(200, Math.floor(Number(goal) || DEFAULT_BOOKS_PER_YEAR)));
  const f = Math.max(0, Math.min(200, Math.floor(Number(finished) || 0)));
  const size = Math.max(g, f);
  return {
    cells: Array.from({ length: size }, (_, i) => ({ n: i + 1, done: i < f })),
    finished: f,
    goal: g,
  };
}
