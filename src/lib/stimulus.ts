import { isGenuineFailure, type SetQuality } from "./set-quality.ts";
import type { SessionExercise, WorkoutSet } from "./types.ts";

/**
 * Scoring a set, then an exercise, then a session — one number at each level,
 * each built from the level below it.
 *
 * The set sheet already collects the right observations. What it never did was
 * turn them into a figure, so "what stopped it / how close / burn / form" were
 * four answers you gave and never saw again.
 *
 * ## What the weights are based on
 *
 * Proximity to failure is the dominant per-set driver of hypertrophy, and it
 * is the reason the RIR-anchored RPE scale exists at all (Zourdos et al., 2016)
 * — the stimulating reps of a set are the last few before failure, so a set
 * stopped at 3 in reserve delivers a fraction of what the same set taken to 0
 * does. Meta-analytic work on proximity to failure finds the effect rising as
 * reps-in-reserve fall, with the curve flattening near failure rather than
 * continuing to climb. So closeness carries the largest weight, and going PAST
 * failure scores the same as reaching it rather than more: forced reps buy
 * disproportionate fatigue for the extra stimulus.
 *
 * Which muscle failed is second, and it is the thing this app knows that a
 * plain RPE log does not. A press the triceps ended did not take the chest to
 * failure however hard it felt, so the target's stimulus is discounted — the
 * same reasoning the muscle tally already uses to split a set's credit.
 *
 * Technique is third: reps that break down stop loading the target through the
 * range you chose the exercise for.
 *
 * Metabolic burn is last and deliberately small. Mechanical tension is the
 * primary driver and metabolite accumulation the secondary one, and a heavy
 * triple having no burn is normal rather than bad — which is why the floor
 * here is high. A big weight on burn would rank a pump-chasing set above a
 * heavy one, which is the wrong answer.
 *
 * Nothing is scored that was not answered. A set with only closeness recorded
 * is scored on closeness alone and says so, rather than being marked down for
 * the three questions you skipped — the same rule the day score follows.
 */

export const SET_WEIGHTS = {
  proximity: 0.4,
  targeting: 0.3,
  form: 0.2,
  burn: 0.1,
} as const;

export type SetPart = keyof typeof SET_WEIGHTS;

/** Reps left in the tank → share of the available stimulus. */
const PROXIMITY: Record<NonNullable<SetQuality["closeness"]>, number> = {
  // Low on purpose. Under the stimulating-reps reading, the work is done by the
  // last handful of reps before failure, so stopping two or more short removes
  // most of them rather than a proportional slice. 0.55 was the first guess and
  // it let a session of deliberately easy sets score in the sixties.
  reps_left: 0.35, // 2+ RIR
  one_left: 0.8, // ~1 RIR
  nothing: 1, // 0 RIR — the reference point
  forced: 1, // past failure: more fatigue, not more credit
};

/**
 * What ended the set → how much of it landed on the muscle you were training.
 *
 * "Chose to stop" scores high here on purpose. Stopping early is a proximity
 * problem, not a targeting one, and it is already paid for above — charging it
 * twice would make a clean, deliberately-submaximal set look like a failed one.
 */
const TARGETING: Record<NonNullable<SetQuality["limiter"]>, number> = {
  target: 1,
  choice: 0.9,
  form: 0.55,
  synergist: 0.5,
};

const FORM: Record<1 | 2 | 3, number> = { 1: 0.55, 2: 0.82, 3: 1 };
const BURN: Record<1 | 2 | 3, number> = { 1: 0.65, 2: 0.85, 3: 1 };

export interface SetRating {
  /** 0-100 of what was answered, or null when nothing was. */
  score: number | null;
  /** Each answered component, 0-1. */
  parts: Partial<Record<SetPart, number>>;
  /** Share of the weighting that could be assessed, 0-1. */
  coverage: number;
  /** True failure of the target, by the stricter existing definition. */
  genuine: boolean;
}

/**
 * One set, 0-100.
 *
 * Warm-ups are not scored — they are not stimulus and averaging them in would
 * drag every exercise down for doing the right thing.
 */
export function rateSet(set: WorkoutSet & SetQuality): SetRating {
  const parts: Partial<Record<SetPart, number>> = {};

  if (set.closeness) parts.proximity = PROXIMITY[set.closeness];
  if (set.limiter) parts.targeting = TARGETING[set.limiter];
  if (set.form) parts.form = FORM[set.form];
  if (set.burn) parts.burn = BURN[set.burn];

  let weighted = 0;
  let available = 0;
  for (const key of Object.keys(SET_WEIGHTS) as SetPart[]) {
    const value = parts[key];
    if (value == null) continue;
    weighted += value * SET_WEIGHTS[key];
    available += SET_WEIGHTS[key];
  }

  return {
    score: available > 0 ? Math.round((weighted / available) * 100) : null,
    parts,
    coverage: available,
    genuine: isGenuineFailure(set),
  };
}

/**
 * How much the pump moves an exercise's rating.
 *
 * Small on purpose. Pump is a real signal of local metabolite accumulation and
 * worth capturing, but it is a sensation reported after the fact and the sets
 * themselves are the measurement. ±6% nudges the number without letting a good
 * pump rescue three sets that stopped three reps short.
 */
const PUMP_MODIFIER: Record<1 | 2 | 3, number> = { 1: 0.94, 2: 1, 3: 1.06 };

export interface ExerciseRating {
  score: number | null; // 0-100
  /** Mean of the rated sets before the pump modifier, so the effect is visible. */
  fromSets: number | null;
  ratedSets: number;
  workingSets: number;
  pump?: 1 | 2 | 3;
  /** Per-set scores in order, for a sparkline or a tooltip. */
  setScores: (number | null)[];
}

/**
 * One exercise in one session, 0-100.
 *
 * The mean of its working sets rather than the best or the last: three sets
 * where the third collapsed is not the same session as three consistent ones,
 * and the average is what says so.
 */
export function rateExerciseInstance(
  ex: Pick<SessionExercise, "sets" | "pump">,
): ExerciseRating {
  const working = (ex.sets ?? []).filter((s) => s.done && s.type !== "warmup");
  const ratings = working.map((s) => rateSet(s));
  const scored = ratings.map((r) => r.score).filter((n): n is number => n != null);

  if (!scored.length) {
    return {
      score: null,
      fromSets: null,
      ratedSets: 0,
      workingSets: working.length,
      pump: ex.pump,
      setScores: ratings.map((r) => r.score),
    };
  }

  const fromSets = scored.reduce((a, b) => a + b, 0) / scored.length;
  const modifier = ex.pump ? PUMP_MODIFIER[ex.pump] : 1;

  return {
    score: Math.max(0, Math.min(100, Math.round(fromSets * modifier))),
    fromSets: Math.round(fromSets),
    ratedSets: scored.length,
    workingSets: working.length,
    pump: ex.pump,
    setScores: ratings.map((r) => r.score),
  };
}

export interface SessionRating {
  score: number | null; // 0-100
  ratedExercises: number;
  totalExercises: number;
  ratedSets: number;
  workingSets: number;
  /** Every exercise's own rating, in session order. */
  exercises: { name: string; rating: ExerciseRating }[];
  /** How much of the session carries ratings at all, 0-1. */
  coverage: number;
}

/**
 * One session, 0-100.
 *
 * Weighted by how many rated sets each exercise contributed, so five sets of
 * squats count for more than one set of calf raises. A straight average would
 * let a single well-rated accessory outweigh the work the session was actually
 * built around.
 */
export function rateSession(
  session: { exercises: Pick<SessionExercise, "name" | "sets" | "pump">[] } | null | undefined,
): SessionRating {
  const exercises = (session?.exercises ?? []).map((ex) => ({
    name: ex.name,
    rating: rateExerciseInstance(ex),
  }));

  let weighted = 0;
  let weight = 0;
  let ratedSets = 0;
  let workingSets = 0;

  for (const { rating } of exercises) {
    workingSets += rating.workingSets;
    ratedSets += rating.ratedSets;
    if (rating.score == null) continue;
    weighted += rating.score * rating.ratedSets;
    weight += rating.ratedSets;
  }

  const rated = exercises.filter((e) => e.rating.score != null).length;

  return {
    score: weight > 0 ? Math.round(weighted / weight) : null,
    ratedExercises: rated,
    totalExercises: exercises.length,
    ratedSets,
    workingSets,
    exercises,
    coverage: workingSets > 0 ? ratedSets / workingSets : 0,
  };
}

/** Wording for a score, so the number is never on its own. */
export function ratingLabel(score: number): string {
  if (score >= 85) return "outstanding";
  if (score >= 72) return "strong";
  if (score >= 58) return "solid";
  if (score >= 42) return "light";
  return "easy";
}

/** Colour class for a score, shared by every screen that shows one. */
export function ratingTone(score: number | null): string {
  if (score == null) return "text-faint";
  if (score >= 85) return "text-emerald-400";
  if (score >= 72) return "text-accent-text";
  if (score >= 58) return "text-info";
  if (score >= 42) return "text-warn";
  return "text-orange-400";
}

/**
 * Why a set scored what it did, as readable lines.
 *
 * A bare number invites arguing with it. These are the four inputs with their
 * weights, so the score is checkable and it is obvious which answer would move
 * it.
 */
export const SET_PART_LABELS: Record<SetPart, string> = {
  proximity: "Closeness to failure",
  targeting: "Right muscle failed",
  form: "Technique",
  burn: "Burn",
};

export function setBreakdown(
  rating: SetRating,
): { key: SetPart; label: string; pct: number; weight: number }[] {
  return (Object.keys(SET_WEIGHTS) as SetPart[])
    .filter((k) => rating.parts[k] != null)
    .map((k) => ({
      key: k,
      label: SET_PART_LABELS[k],
      pct: Math.round((rating.parts[k] ?? 0) * 100),
      weight: Math.round(SET_WEIGHTS[k] * 100),
    }));
}
