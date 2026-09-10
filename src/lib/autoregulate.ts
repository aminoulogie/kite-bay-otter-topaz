/**
 * The pieces of autoregulation that are pure enough to test.
 *
 * The progression ladder in soma/engine.ts sees one historical set. The
 * wrapper around it sees the session's context. This file holds the four
 * inputs to that context that are arithmetic rather than policy, so they can
 * be asserted in isolation instead of only through a rendered card:
 *
 *  - what a rated set means on the old 1-5 failure scale,
 *  - what being over MRV does to a lift's readiness,
 *  - what sleep debt does to it,
 *  - how many sets a deload week actually asks for.
 *
 * Every one of them can only ever move the prescription DOWN. That is the
 * rule the whole layer rests on: the app is allowed to protect you from a
 * session you cannot recover from, and is never allowed to talk you into a
 * heavier one because you said you felt good.
 */

import type { Closeness, Limiter } from "./set-quality.ts";

// ------------------------------------------------------- what a set was worth --

/**
 * The legacy 1-5 failure figure implied by a rated set.
 *
 * Two fields describe the same event — `closeness` (what the lifter observed)
 * and `failure` (what the ladder reads) — so they must never disagree.
 *
 * The mapping matters more than it looks. `nothing` is 3, not 5: taking a set
 * to the point where another rep is impossible is the TARGET, and the ladder
 * answers a 3 with "+1 rep next time". Calling it a 5 answers it with "hold
 * the load and solidify form", which is how a lifter who trains hard every
 * session ends up never progressing. Only `forced` — past failure, with help
 * or a drop — earns the 5.
 */
export const CLOSENESS_TO_FAILURE: Record<Closeness, number> = {
  reps_left: 1,
  one_left: 2,
  nothing: 3,
  forced: 5,
};

/**
 * Beyond this the set did not fail the muscle it was for.
 *
 * When the triceps gave out on a bench press, or the technique broke before
 * the chest did, the chest did not reach failure however hard it felt — so
 * that set cannot be evidence for holding the load. Capping at 3 keeps the
 * ladder progressing rather than consolidating around someone else's limit.
 */
export const LIMITER_FAILURE_CAP = 3;

export function failureFromQuality(q: { closeness?: Closeness; limiter?: Limiter }): number | null {
  if (!q.closeness) return null;
  const raw = CLOSENESS_TO_FAILURE[q.closeness];
  if (raw == null) return null;
  if (q.limiter === "synergist" || q.limiter === "form") {
    return Math.min(raw, LIMITER_FAILURE_CAP);
  }
  return raw;
}

// --------------------------------------------------------------- volume cap --

/**
 * A lift whose muscle is already past MRV for the week.
 *
 * More load on top of volume you cannot recover from is the fastest way to
 * dig a hole, so such a lift is treated as partially recovered whatever the
 * recovery clock says: hold the weight, chase a rep. 69 rather than 70
 * because the wrapper's band is `< 70`.
 */
export const OVER_MRV_READINESS = 69;

export function capForVolume(readiness: number | null, overMrv: boolean): number | null {
  if (!overMrv) return readiness;
  if (readiness == null) return OVER_MRV_READINESS;
  return Math.min(readiness, OVER_MRV_READINESS);
}

// ---------------------------------------------------------------- sleep debt --

/** Debt at or past this scales the day's readiness down. */
export const DEBT_THRESHOLD_HOURS = 8;

/** How far it scales it. One step, not a slope: this is a flag, not a model. */
export const DEBT_SCALE = 0.85;

/** However bad the week was, a lifter is never reported as fully incapable. */
export const READINESS_FLOOR = 10;

/**
 * Sleep debt applied to an already-blended readiness figure.
 *
 * Deliberately applied AFTER the blend rather than inside it. The blend
 * already reads last night's hours; this is the separate fact that the last
 * fortnight was short, which last night alone cannot express.
 */
export function readinessWithSleepDebt(
  readiness: number | null,
  debtHours: number,
): number | null {
  if (readiness == null) return null;
  if (!(debtHours >= DEBT_THRESHOLD_HOURS)) return readiness;
  return Math.round(Math.max(READINESS_FLOOR, readiness * DEBT_SCALE));
}

// -------------------------------------------------------------- deload sets --

/** No matter how light the week, one set is a warm-up rather than a session. */
export const MIN_DELOAD_SETS = 2;

/**
 * Sets for a lift on a deload week.
 *
 * Rounded UP: three sets halving to one is a rounding decision that quietly
 * turns a deload into a skipped session.
 */
export function deloadSetCount(normal: number): number {
  const n = Math.floor(Number(normal) || 0);
  if (n <= 0) return MIN_DELOAD_SETS;
  return Math.max(MIN_DELOAD_SETS, Math.ceil(n / 2));
}

/** The base anchor the mesocycle clock has always counted from. */
export const BASE_ANCHOR = "2026-08-23";

/**
 * Which date the week count runs from.
 *
 * A programme carrying its own anchor owns its phasing; anything else falls
 * back to the shipped base date, so switching programme never re-labels the
 * weeks a lifter has already trained.
 */
export function mesoAnchor(program?: { anchor?: string } | null): string {
  const a = program?.anchor;
  return typeof a === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a) ? a : BASE_ANCHOR;
}
