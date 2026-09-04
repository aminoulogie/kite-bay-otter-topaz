import type { SessionExercise, WorkoutSet } from "./types";

/**
 * What actually happened in a set, and what that means.
 *
 * The old 1-5 "failure" rating conflated two different events: the LIFT failing
 * and the MUSCLE YOU WERE TRAINING failing. On a barbell press those are often
 * not the same thing — triceps or shoulders give out first and the chest never
 * reaches failure — yet both were logged as a 5.
 *
 * So nothing here asks "was that a real failure?". That is the thing being
 * computed, and self-rating it just moves the guess earlier. Observations are
 * recorded instead — what stopped the set, how close it got, how it felt — and
 * the verdict is derived from them.
 */

/** What ended the set. The single most informative field, and the one nobody logs. */
export type Limiter =
  | "target" // the muscle being trained gave out
  | "synergist" // another muscle went first: triceps on bench, grip on rows
  | "form" // technique broke before the muscle did
  | "choice"; // stopped with something left

/** How close the set came to true failure. */
export type Closeness =
  | "reps_left" // 2+ in reserve
  | "one_left" // ~1 in reserve
  | "nothing" // could not complete another rep
  | "forced"; // past failure with assistance or a drop

export interface SetQuality {
  limiter?: Limiter;
  closeness?: Closeness;
  burn?: 1 | 2 | 3; // per set: metabolic burn. Builds across a set, so set 1
  // of heavy work legitimately has none.
  form?: 1 | 2 | 3; // 3 clean, 2 some breakdown, 1 broke down.
  /** Which muscles gave out first. Only meaningful when limiter is "synergist". */
  limitedBy?: string[];
}

export interface ExerciseQuality {
  pump?: 1 | 2 | 3; // per exercise: only judgeable once you rack the weight
  effectiveness?: number; // 0-10, computed — see rateExercise
}

export type QualitySet = WorkoutSet & SetQuality;

/**
 * A set that genuinely took the target muscle to failure.
 *
 * Requires all three to agree: the right muscle was the limiter, there was
 * nothing left, and the body corroborated it. A grinding set where the triceps
 * died first is honestly NOT a chest failure — which is the whole point.
 */
export function isGenuineFailure(s: SetQuality): boolean {
  if (s.limiter !== "target") return false;
  if (s.closeness !== "nothing" && s.closeness !== "forced") return false;
  return (s.burn ?? 0) >= 2;
}

/** Hard but not a true failure of the target — still counts, less. */
export function isHardSet(s: SetQuality): boolean {
  return s.closeness === "nothing" || s.closeness === "forced" || s.closeness === "one_left";
}

/**
 * Where a set's stimulus actually landed.
 *
 * When another muscle fails first, that muscle did the limiting work, so it
 * earns the larger share. Crediting the intended target in full would keep
 * reporting chest volume for sets the chest never finished — and would keep
 * under-reporting the synergist that is quietly doing all the work.
 */
export function stimulusSplit(
  ex: Pick<SessionExercise, "targetKeys">,
  s: SetQuality,
  synergistKeys: string[] = [],
): Record<string, number> {
  const out: Record<string, number> = {};
  const targets = ex.targetKeys ?? [];

  if (s.limiter === "synergist" && synergistKeys.length) {
    for (const k of synergistKeys) out[k] = (out[k] ?? 0) + 0.7 / synergistKeys.length;
    for (const k of targets) out[k] = (out[k] ?? 0) + 0.3 / targets.length;
    return out;
  }

  for (const k of targets) out[k] = (out[k] ?? 0) + 1 / (targets.length || 1);
  return out;
}

// --------------------------------------------------------------- weak links --

export interface WeakLink {
  limiterKey: string;
  exercise: string;
  limitedSets: number;
  totalSets: number;
  share: number; // 0-1
}

/**
 * Lifts held back by something other than the muscle they train.
 *
 * This is the "my forearms are stopping my back" case: the back can do more,
 * the grip cannot, and straps hide it rather than fix it. Surfaced once a lift
 * is limited by a synergist in most of its recent sets.
 */
export function findWeakLinks(
  sessions: { exercises: { name: string; targetKeys?: string[]; sets: QualitySet[] }[] }[],
  opts: { minSets?: number; minShare?: number } = {},
): WeakLink[] {
  const minSets = opts.minSets ?? 6;
  const minShare = opts.minShare ?? 0.4;

  const tally = new Map<string, { limited: number; total: number; keys: Map<string, number> }>();
  for (const session of sessions) {
    for (const ex of session.exercises ?? []) {
      for (const s of ex.sets ?? []) {
        if (!s.done || !s.limiter) continue;
        const t = tally.get(ex.name) ?? { limited: 0, total: 0, keys: new Map() };
        t.total += 1;
        if (s.limiter === "synergist") {
          t.limited += 1;
          for (const k of s.limitedBy ?? []) t.keys.set(k, (t.keys.get(k) ?? 0) + 1);
        }
        tally.set(ex.name, t);
      }
    }
  }

  const out: WeakLink[] = [];
  for (const [exercise, t] of tally) {
    if (t.total < minSets) continue;
    const share = t.limited / t.total;
    if (share < minShare) continue;
    const top = [...t.keys.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      limiterKey: top?.[0] ?? "unknown",
      exercise,
      limitedSets: t.limited,
      totalSets: t.total,
      share,
    });
  }
  return out.sort((a, b) => b.share - a.share);
}

// ------------------------------------------------------- exercise rating /10 --

/**
 * How much an exercise is actually doing for you, 0-10.
 *
 * Weighted toward whether the intended muscle is the one that fails, because a
 * movement whose synergists always give out first is training something other
 * than what it is in the programme for — however good it feels.
 *
 * Deliberately NOT counting how heavy the lift is. Load is a property of the
 * movement, not of its usefulness, and rewarding it would rank every barbell
 * lift above every cable one by default.
 */
export const RATING_WEIGHTS = {
  onTarget: 3.0, // the target muscle is what fails
  sensation: 2.5, // pump and burn actually delivered
  progression: 2.5, // you are getting stronger on it
  reliability: 1.0, // it delivers consistently, not once in five
  efficiency: 1.0, // stimulus relative to how wrecked it leaves you
} as const;

export interface RatingInput {
  sets: SetQuality[];
  pumps: number[]; // per-exercise pump ratings, 1-3
  e1rmByDate: { date: string; value: number }[];
  isAxial?: boolean;
}

export interface Rating {
  score: number; // 0-10
  parts: Record<keyof typeof RATING_WEIGHTS, number>; // each 0-1
  confidence: "low" | "medium" | "high";
  sampleSets: number;
}

export function rateExercise(input: RatingInput): Rating {
  const { sets, pumps, e1rmByDate } = input;
  const rated = sets.filter((s) => s.limiter);

  const onTarget = rated.length ? rated.filter((s) => s.limiter === "target").length / rated.length : 0;

  const burns = sets.map((s) => s.burn).filter((b): b is 1 | 2 | 3 => !!b);
  const meanBurn = burns.length ? burns.reduce((a, b) => a + b, 0) / burns.length : 0;
  const meanPump = pumps.length ? pumps.reduce((a, b) => a + b, 0) / pumps.length : 0;
  const sensation = (meanBurn + meanPump) / 6; // both are 1-3

  // Trend of estimated 1RM across the logged dates, normalised so that roughly
  // +20% over the window reads as a full score.
  let progression = 0;
  if (e1rmByDate.length >= 2) {
    const first = e1rmByDate[0]!.value;
    const last = e1rmByDate[e1rmByDate.length - 1]!.value;
    if (first > 0) progression = Math.max(0, Math.min(1, (last / first - 1) / 0.2));
  }

  const genuine = sets.filter(isGenuineFailure).length;
  const reliability = sets.length ? genuine / sets.length : 0;

  // An axial lift costs systemic fatigue that a machine does not, so it has to
  // deliver more to rate the same.
  const efficiency = input.isAxial ? Math.max(0, onTarget - 0.15) : onTarget;

  const parts = { onTarget, sensation, progression, reliability, efficiency };
  const total = (Object.keys(RATING_WEIGHTS) as (keyof typeof RATING_WEIGHTS)[]).reduce(
    (sum, k) => sum + parts[k] * RATING_WEIGHTS[k],
    0,
  );

  const n = rated.length;
  return {
    score: Math.round(total * 10) / 10,
    parts,
    confidence: n >= 12 ? "high" : n >= 5 ? "medium" : "low",
    sampleSets: n,
  };
}
