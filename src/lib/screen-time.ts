/**
 * Screen time, typed in by hand — because iOS will not hand it over.
 *
 * Worth stating plainly, since "why isn't this automatic" is the first thing
 * anyone asks. Apple exposes usage figures through DeviceActivityReport, whose
 * contents render inside a separate extension sandbox: the host app cannot read
 * what that view displays, and the extension has no network and no way to pass
 * anything back. Even the coarse threshold callbacks need the Family Controls
 * entitlement, which Apple grants by application and which free provisioning
 * cannot carry at all — so it is doubly closed to a sideloaded build. There is
 * no Shortcuts action for it either. Twenty seconds of typing is not a fallback
 * here, it is the only door.
 *
 * Which means the number has to EARN those twenty seconds, and a lone total on
 * a card does not. The payoff is the comparison: the Time tab already knows how
 * many hours you left flexible today, so the phone's share of them is a fact
 * about your plan rather than a statistic about your phone.
 *
 * Nothing here judges. It reports what the two numbers are and lets them sit
 * next to each other, which is the whole argument.
 */

import { formatHours } from "./day-plan.ts";
import { addDays, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";

export const MAX_MINUTES = 24 * 60;

/** Days a window needs before a trend is worth stating. */
export const MIN_TREND_DAYS = 3;

/** A change smaller than this is noise, not a direction. */
export const TREND_NOISE_MIN = 10;

export interface ScreenApp {
  name: string;
  min: number;
}

export interface ScreenTimeDay {
  /** Minutes on the device. */
  total: number;
  /** The apps worth naming. Optional: the total is the point. */
  apps?: ScreenApp[];
  /** Pickups, if you care to record them. */
  pickups?: number;
}

export type ScreenLog = Record<string, ScreenTimeDay>;

export function clampMinutes(n: number): number {
  const v = Math.round(Number(n) || 0);
  return Math.min(MAX_MINUTES, Math.max(0, v));
}

/**
 * Read a duration the way Screen Time prints it.
 *
 * "4h 12m", "4:12", "4h", "45m" and a bare "252" all mean the same thing. A
 * bare number is MINUTES, which is the one case worth being deliberate about:
 * reading "4" as four hours would quadruple a short day without a word.
 */
export function parseDuration(text: string): number | null {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return null;

  const clock = s.match(/^(\d{1,2})\s*:\s*([0-5]?\d)$/);
  if (clock) return clampMinutes(Number(clock[1]) * 60 + Number(clock[2]));

  const hm = s.match(/^(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (hm && (hm[1] || hm[2])) {
    const h = hm[1] ? Number(hm[1].replace(",", ".")) : 0;
    const m = hm[2] ? Number(hm[2]) : 0;
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return clampMinutes(h * 60 + m);
  }

  if (/^\d+$/.test(s)) return clampMinutes(Number(s));
  return null;
}

/** "4h 12m". The same shape the Time tab uses everywhere else. */
export function formatMinutes(min: number): string {
  return formatHours(clampMinutes(min) / 60);
}

export function lastNDays(today: string, n: number): string[] {
  const base = parseLocalDateKey(today);
  return Array.from({ length: n }, (_, i) => getLocalDateKey(addDays(base, -(n - 1 - i))));
}

export interface Window {
  /** Only the days actually logged. An unlogged day is unknown, not zero. */
  days: number;
  total: number;
  average: number;
}

/**
 * Average across a set of dates.
 *
 * Missing days are skipped rather than counted as zero. A phone left in a
 * drawer for a week and a week nobody logged look identical in storage, and
 * treating silence as abstinence would quietly reward not logging.
 */
export function windowFor(log: ScreenLog, dates: string[]): Window {
  let total = 0;
  let days = 0;
  for (const d of dates) {
    const entry = log?.[d];
    if (!entry || !Number.isFinite(entry.total)) continue;
    total += clampMinutes(entry.total);
    days++;
  }
  return { days, total, average: days ? Math.round(total / days) : 0 };
}

export type Direction = "up" | "down" | "flat" | "unknown";

export interface Trend {
  direction: Direction;
  /** Minutes a day, this week against the one before. Positive means more. */
  delta: number;
  recent: Window;
  prior: Window;
}

export function trend(log: ScreenLog, today: string, span = 7): Trend {
  const recent = windowFor(log, lastNDays(today, span));
  const priorEnd = getLocalDateKey(addDays(parseLocalDateKey(today), -span));
  const prior = windowFor(log, lastNDays(priorEnd, span));

  if (recent.days < MIN_TREND_DAYS || prior.days < MIN_TREND_DAYS) {
    return { direction: "unknown", delta: 0, recent, prior };
  }
  const delta = recent.average - prior.average;
  const direction: Direction =
    Math.abs(delta) < TREND_NOISE_MIN ? "flat" : delta > 0 ? "up" : "down";
  return { direction, delta, recent, prior };
}

export interface PlanShare {
  min: number;
  flexibleMin: number;
  /** Fraction of the day's flexible time the phone took. 0 when none was set. */
  share: number;
  /** True when the phone outlasted the time the plan left free. */
  over: boolean;
}

/**
 * The phone against the hours the day plan left flexible.
 *
 * Flexible time is the only honest denominator. Measuring against the whole 24
 * counts sleep and work as time you could have spent differently, and measuring
 * against waking hours counts the eight you already pinned to a job.
 */
export function againstPlan(min: number, flexibleHours: number): PlanShare {
  const m = clampMinutes(min);
  const flexibleMin = Math.max(0, Math.round((Number(flexibleHours) || 0) * 60));
  if (flexibleMin <= 0) return { min: m, flexibleMin: 0, share: 0, over: m > 0 };
  return {
    min: m,
    flexibleMin,
    share: m / flexibleMin,
    over: m > flexibleMin,
  };
}

/** The single app that took the most, or null when no breakdown was typed. */
export function topApp(day: ScreenTimeDay | undefined): ScreenApp | null {
  const apps = (day?.apps ?? []).filter((a) => a && a.name?.trim() && a.min > 0);
  if (!apps.length) return null;
  return apps.reduce((best, a) => (a.min > best.min ? a : best));
}

/**
 * Minutes in the total that the named apps do not account for.
 *
 * Floored at zero: naming more than the total is the user's arithmetic going
 * wrong, and "negative forty minutes of everything else" is not a thing to show
 * them about it.
 */
export function unaccounted(day: ScreenTimeDay | undefined): number {
  if (!day) return 0;
  const named = (day.apps ?? []).reduce((a, x) => a + clampMinutes(x.min), 0);
  return Math.max(0, clampMinutes(day.total) - named);
}

/**
 * One line about today, or null when there is nothing to say.
 *
 * Factual on purpose. "Four hours" is a number the user can act on; "that is a
 * lot" is an opinion they did not ask this app for, and a tracker that scolds
 * gets closed.
 */
export function verdict(day: ScreenTimeDay | undefined, flexibleHours: number): string | null {
  if (!day || !Number.isFinite(day.total)) return null;
  const p = againstPlan(day.total, flexibleHours);
  if (p.flexibleMin <= 0) return `${formatMinutes(p.min)} on the phone.`;
  if (p.over) {
    return `${formatMinutes(p.min)} on the phone — more than the ${formatMinutes(p.flexibleMin)} this day left flexible.`;
  }
  return `${formatMinutes(p.min)} of the ${formatMinutes(p.flexibleMin)} flexible today — ${Math.round(p.share * 100)}%.`;
}

/** Bars for the strip: every day in the window, logged or not. */
export interface Bar {
  date: string;
  min: number | null;
}

export function bars(log: ScreenLog, today: string, span = 7): Bar[] {
  return lastNDays(today, span).map((date) => {
    const entry = log?.[date];
    return {
      date,
      min: entry && Number.isFinite(entry.total) ? clampMinutes(entry.total) : null,
    };
  });
}

/** The tallest logged bar, for scaling. Never zero, so a strip always draws. */
export function peak(list: Bar[]): number {
  return Math.max(60, ...list.map((b) => b.min ?? 0));
}
