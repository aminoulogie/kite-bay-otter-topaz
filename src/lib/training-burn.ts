/**
 * What a session actually cost, and what of that is worth eating back.
 *
 * The old figure was wrong three times over, and the three errors multiplied:
 *
 * 1. **Wall clock, uncapped.** Duration ran from the first set to whenever the
 *    session was finished, so a workout left open while you showered, drove
 *    home and ate dinner billed every one of those minutes as training.
 * 2. **Six kcal a minute, flat.** Too high for resistance work, which spends
 *    most of its time resting between sets — and it is a GROSS figure, so it
 *    includes the calories you would have burned lying on the floor instead.
 *    Those are already inside maintenance.
 * 3. **Added to the target whole.** Maintenance already covers the resting cost
 *    of those ninety minutes, so adding a gross burn on top counts them twice.
 *
 * Together they roughly tripled it. Eating back a tripled number is the single
 * most reliable way to stall a cut while doing everything else right.
 *
 * What is here instead is the ACSM metabolic equation, which is the standard
 * one and is stated in METs: kcal/min = MET × 3.5 × kg / 200. Resistance
 * training sits between 3.5 METs and 6 depending on how hard the sets are
 * taken. One MET is resting, so subtracting it leaves the cost of training
 * ABOVE simply existing — which is the only part maintenance does not already
 * account for, and therefore the only part it is honest to eat back.
 *
 * Nothing here rewrites a stored figure. The number is derived from the session
 * that was logged, so a session recorded under the old formula is re-read
 * correctly rather than carrying its inflation around for ever.
 */

import type { HistorySession, WorkoutSet } from "./types.ts";

/** kcal/min = MET × 3.5 × kg / 200. The ACSM equation, unchanged. */
export const KCAL_PER_MET_MIN = 3.5 / 200;

/** Resting is one MET by definition, and maintenance already counts it. */
export const RESTING_MET = 1;

/** Resistance training, from an easy set to one taken to failure. */
export const MET_EASY = 3.5;
export const MET_HARD = 6;

/**
 * A working set, under tension and the moments either side of it.
 *
 * This is what separates a session from ninety minutes of the sport it is
 * named after. Applying a vigorous MET to the whole clock assumes continuous
 * work, and a lifting session is not continuous: twenty sets is fifteen
 * minutes of effort inside an hour and a half, and the other seventy-five are
 * spent standing about. Billing all ninety at six METs is how a session that
 * cost two hundred and fifty calories gets reported as nine hundred.
 */
export const SET_SECONDS = 45;

/** Standing between sets. Above true rest, well below the set itself. */
export const REST_MET = 1.5;

/** A set plus its rest. Used to sanity-check the clock, not to replace it. */
export const MINUTES_PER_SET = 3;

/** How far past what the sets imply the wall clock is still believed. */
export const CLOCK_TRUST = 1.5;

/** Sessions shorter than this are not worth arguing about. */
export const MIN_MINUTES = 10;

/** Used when the day carries no bodyweight, so a burn is still roughly right. */
export const ASSUMED_KG = 78;

/** "45:30" back to 45.5 minutes. Returns 0 for anything unparseable. */
export function minutesFrom(durationFormatted: string | undefined): number {
  const m = String(durationFormatted ?? "").match(/^(\d+):([0-5]?\d)$/);
  if (!m) return 0;
  return Number(m[1]) + Number(m[2]) / 60;
}

/**
 * The duration to bill.
 *
 * The clock is believed up to half again as long as the sets imply, and no
 * further. Twenty sets say about an hour; a four-hour clock against them means
 * the session was left open, not that four hours were trained. Taking the
 * lower of the two is the conservative choice, and being conservative is the
 * whole point of a number you are about to eat.
 */
export function credibleMinutes(wallClockMin: number, totalSets: number): number {
  const clock = Math.max(0, Number(wallClockMin) || 0);
  const sets = Math.max(0, Math.floor(Number(totalSets) || 0));
  if (!sets) return 0;
  const implied = Math.max(MIN_MINUTES, sets * MINUTES_PER_SET);
  return Math.min(clock || implied, implied * CLOCK_TRUST);
}

/** Average closeness-to-failure across every completed set, 1 to 5. */
export function averageIntensity(session: Pick<HistorySession, "exercises">): number {
  let sum = 0;
  let n = 0;
  for (const ex of session.exercises ?? []) {
    for (const st of (ex.sets ?? []) as WorkoutSet[]) {
      if (!st?.done) continue;
      const f = Number(st.failure);
      sum += Number.isFinite(f) && f > 0 ? Math.min(5, f) : 3;
      n++;
    }
  }
  return n ? sum / n : 3;
}

/** Where a session sits between an easy MET and a hard one. */
export function metFor(avgIntensity: number): number {
  const i = Math.min(5, Math.max(1, Number(avgIntensity) || 3));
  return MET_EASY + ((i - 1) / 4) * (MET_HARD - MET_EASY);
}

export interface Burn {
  /** Everything the session cost, resting metabolism included. */
  gross: number;
  /** What it cost ABOVE resting — the only part not already in maintenance. */
  net: number;
  minutes: number;
  /** The MET of a working set. The session average is lower — most of it is rest. */
  met: number;
  /** Minutes actually under tension, out of the billed total. */
  workMinutes: number;
}

/**
 * What one logged session cost.
 *
 * Derived from the session rather than read off the stored `caloriesBurned`,
 * so a workout logged under the old formula reports honestly today.
 */
export function sessionBurn(
  session: Pick<HistorySession, "exercises" | "totalSets" | "durationFormatted"> | undefined | null,
  weightKg = ASSUMED_KG,
): Burn {
  const none = { gross: 0, net: 0, minutes: 0, met: 0, workMinutes: 0 };
  if (!session) return none;
  const kg = Number(weightKg) > 0 ? Number(weightKg) : ASSUMED_KG;
  const sets = Math.max(0, Math.floor(Number(session.totalSets) || 0));
  const minutes = credibleMinutes(minutesFrom(session.durationFormatted), sets);
  if (minutes <= 0) return none;

  // Split the clock: time under tension at the set's own MET, the rest of it
  // at standing-about. A single average over the whole session would bill the
  // rests as if they were the sets.
  const met = metFor(averageIntensity(session));
  const workMinutes = Math.min(minutes, (sets * SET_SECONDS) / 60);
  const restMinutes = minutes - workMinutes;

  const metMinutes = met * workMinutes + REST_MET * restMinutes;
  const gross = metMinutes * KCAL_PER_MET_MIN * kg;
  const resting = RESTING_MET * minutes * KCAL_PER_MET_MIN * kg;

  return {
    gross: Math.round(gross),
    net: Math.max(0, Math.round(gross - resting)),
    minutes: Math.round(minutes),
    met: Math.round(met * 10) / 10,
    workMinutes: Math.round(workMinutes),
  };
}

/**
 * What to add to the day's target, which is the NET figure and never the gross.
 *
 * Returns zero when eating training back is switched off — the honest default
 * for anyone who set their target from a maintenance figure that already
 * assumed they train.
 */
export function eatBack(burn: Burn, enabled: boolean): number {
  return enabled ? burn.net : 0;
}
