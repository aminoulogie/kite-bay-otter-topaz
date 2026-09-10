/**
 * Hunger, logged and penalised.
 *
 * On a surplus, being hungry is a signal that the surplus is not there. The
 * day's calories can hit target and the day can still have gone wrong — eaten
 * late, eaten in two sittings, or the target itself is too low — and none of
 * that shows in a macro total. So it is worth recording as its own fact rather
 * than being inferred from numbers that look fine.
 *
 * ## Why the penalty depends on the phase
 *
 * On a CUT, hunger is the expected cost of the thing you chose to do. Docking
 * points for it would be punishing someone for a deficit working, and would
 * make the score reward eating more during a cut, which is backwards.
 *
 * On a BULK it is the opposite: hunger means the surplus did not happen.
 * On MAINTENANCE it is a mild signal, worth noting and not worth much.
 *
 * The scale is deliberately shallow. One hungry hour on a bulk is a nudge, not
 * a failed day — a score that collapses on a single log is one people stop
 * logging honestly, which costs more than the signal is worth.
 */

export type Phase = "bulk" | "cut" | "maintain";

export interface HungerEntry {
  /** Local date key. */
  date: string;
  /** ISO timestamp, so several in a day are distinguishable and orderable. */
  at: string;
  /** 1 peckish, 2 hungry, 3 ravenous. */
  level: 1 | 2 | 3;
  note?: string;
}

export const HUNGER_LABEL: Record<1 | 2 | 3, string> = {
  1: "Peckish",
  2: "Hungry",
  3: "Ravenous",
};

/** The most this can take off a day, out of 100. */
export const MAX_HUNGER_PENALTY = 10;

/**
 * How many points a day's hunger costs.
 *
 * Sums the levels, then compresses: the first log costs the most and each
 * further one adds less. Someone logging honestly through a bad afternoon
 * should not be punished more than someone who logged once and gave up.
 */
export function hungerPenalty(entries: HungerEntry[], phase: Phase): number {
  if (phase === "cut") return 0;
  const total = entries.reduce((a, e) => a + e.level, 0);
  if (total <= 0) return 0;
  const weight = phase === "bulk" ? 1 : 0.4;
  // sqrt so the second and third log add progressively less than the first.
  const raw = Math.sqrt(total) * 2.6 * weight;
  return Math.round(Math.min(MAX_HUNGER_PENALTY, raw) * 10) / 10;
}

/** Entries logged on one date. */
export function hungerOn(entries: HungerEntry[], date: string): HungerEntry[] {
  return entries.filter((e) => e.date === date);
}

/**
 * A line explaining the deduction, or why there was not one.
 *
 * The "why not" matters as much as the why: someone on a cut who logs hunger
 * and sees no penalty should know that was deliberate rather than broken.
 */
export function hungerNote(entries: HungerEntry[], phase: Phase): string {
  const today = entries.length;
  if (!today) return "Nothing logged.";
  if (phase === "cut") {
    return `${today} logged. No penalty on a cut — hunger is the deficit working, not a mistake.`;
  }
  const p = hungerPenalty(entries, phase);
  return phase === "bulk"
    ? `${today} logged · −${p} points. On a surplus, hunger means the surplus did not happen.`
    : `${today} logged · −${p} points.`;
}

/**
 * Days in a window where hunger was logged, for the trend.
 *
 * A single hungry day is noise. A pattern of them on a bulk means the target
 * is wrong, and that is worth surfacing where a per-day figure never would.
 */
export function hungryDayRate(entries: HungerEntry[], dates: string[]): number | null {
  if (!dates.length) return null;
  const withHunger = new Set(entries.map((e) => e.date));
  const n = dates.filter((d) => withHunger.has(d)).length;
  return Math.round((n / dates.length) * 100);
}
