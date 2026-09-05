import { isGenuineFailure, isHardSet } from "./set-quality.ts";
import type { HistorySession } from "./types.ts";

/**
 * How complete a day was, out of 100.
 *
 * Two rules shape the whole thing.
 *
 * A day is scored out of WHAT WAS TRACKED, never out of 100 regardless. If food
 * was never logged, that is unknown, not zero — scoring it zero would punish
 * not writing something down as if it were not eating, and would make every
 * incomplete day look like a failure.
 *
 * And the workout share is not paid for turning up. Completing the planned sets
 * is a third of it; the rest is whether the sets were actually taken to
 * failure OF THE TARGET MUSCLE, and whether the session moved anything
 * forward. Grinding three real sets beats coasting through eight.
 */

/** Every weight lives here so the whole thing can be retuned in one place. */
export const SCORE_WEIGHTS = {
  workout: 40,
  protein: 18,
  calories: 13,
  sleep: 13,
  creatine: 8,
  /**
   * Pre-workout fuelling.
   *
   * Taken from the other nutrition weights rather than added on top, so the
   * total stays 100 and every previous day's score keeps the same meaning.
   * Worth its own slice because what you eat before a session changes the
   * session, in a way that the day's total macros do not capture.
   */
  preworkout: 8,
} as const;

/** How the workout's 40 is split. Sums to SCORE_WEIGHTS.workout. */
export const WORKOUT_WEIGHTS = {
  completion: 12, // planned sets actually done
  effort: 14, // sets that genuinely reached failure of the target
  progression: 8, // beat or matched the last session on the same lifts
  coverage: 6, // hit every muscle the split intended
} as const;

export const SLEEP_TARGET_HOURS = 8;
export const CREATINE_TARGET_G = 5;

export interface DayInputs {
  session?: HistorySession | null;
  /** Previous session on the same split, for the progression component. */
  previous?: HistorySession | null;
  protein?: { grams: number; target: number } | null;
  calories?: { kcal: number; target: number } | null;
  sleepHours?: number | null;
  creatineG?: number | null;
  /** A rest day is not a missed workout, so the workout share is not counted. */
  isRestDay?: boolean;
  /**
   * How well the pre-workout window was fuelled, 0-1, or null when nothing was
   * logged under it. Null on a rest day too — there was no session to fuel.
   */
  preworkout?: number | null;
}

export interface ScoreLine {
  id: string;
  label: string;
  /** null when nothing was logged — shown as "not logged", never as 0. */
  earned: number | null;
  possible: number;
  detail: string;
}

export interface DayScore {
  score: number; // 0-100, of what was tracked
  earned: number;
  tracked: number; // total points that were actually assessable
  lines: ScoreLine[];
  untracked: string[];
}

function ratio(actual: number, target: number): number {
  if (!target) return 0;
  // Overshooting a target is not better than hitting it, and hitting 80% of
  // protein is most of the benefit, so this is deliberately not linear-to-zero.
  return Math.max(0, Math.min(1, actual / target));
}

function workoutLines(inp: DayInputs): ScoreLine[] {
  const s = inp.session;
  if (!s) {
    return [
      {
        id: "workout",
        label: "Workout",
        earned: null,
        possible: SCORE_WEIGHTS.workout,
        detail: inp.isRestDay ? "rest day" : "not logged",
      },
    ];
  }

  const sets = s.exercises.flatMap((e) => e.sets ?? []);
  const working = sets.filter((x) => x.done && x.type !== "warmup");
  const planned = sets.filter((x) => x.type !== "warmup").length;

  const completion = planned ? working.length / planned : 0;

  // Effort is the biggest slice, and it only counts sets where the muscle
  // being trained is the one that failed. A set the triceps ended is not
  // chest reaching failure, however hard it felt.
  const genuine = working.filter(isGenuineFailure).length;
  const hard = working.filter(isHardSet).length;
  const rated = working.filter((x) => x.limiter).length;
  const effort = rated
    ? (genuine + 0.4 * (hard - genuine)) / rated
    : working.length
      ? 0.5 // logged but unrated: assume middling rather than punish old data
      : 0;

  // Progression: did any lift beat its previous best top set.
  let progression = 0;
  if (inp.previous) {
    const prevTop = new Map<string, number>();
    for (const e of inp.previous.exercises) {
      const best = Math.max(0, ...(e.sets ?? []).filter((x) => x.done).map((x) => Number(x.weight) || 0));
      prevTop.set(e.name, best);
    }
    const compared = s.exercises.filter((e) => prevTop.has(e.name));
    if (compared.length) {
      const improved = compared.filter((e) => {
        const now = Math.max(0, ...(e.sets ?? []).filter((x) => x.done).map((x) => Number(x.weight) || 0));
        return now >= (prevTop.get(e.name) ?? 0);
      }).length;
      progression = improved / compared.length;
    }
  }

  const intended = new Set(s.exercises.flatMap((e) => e.targetKeys ?? []));
  const worked = new Set(
    s.exercises.filter((e) => (e.sets ?? []).some((x) => x.done)).flatMap((e) => e.targetKeys ?? []),
  );
  const coverage = intended.size ? worked.size / intended.size : 0;

  return [
    {
      id: "completion",
      label: "Sets completed",
      earned: Math.round(completion * WORKOUT_WEIGHTS.completion * 10) / 10,
      possible: WORKOUT_WEIGHTS.completion,
      detail: `${working.length}/${planned} working sets`,
    },
    {
      id: "effort",
      label: "Effort",
      earned: Math.round(effort * WORKOUT_WEIGHTS.effort * 10) / 10,
      possible: WORKOUT_WEIGHTS.effort,
      detail: rated
        ? `${genuine} true ${genuine === 1 ? "failure" : "failures"} of ${rated} rated`
        : "sets not rated",
    },
    {
      id: "progression",
      label: "Progression",
      earned: inp.previous ? Math.round(progression * WORKOUT_WEIGHTS.progression * 10) / 10 : null,
      possible: WORKOUT_WEIGHTS.progression,
      detail: inp.previous ? `${Math.round(progression * 100)}% of lifts held or beat last time` : "no previous session",
    },
    {
      id: "coverage",
      label: "Coverage",
      earned: Math.round(coverage * WORKOUT_WEIGHTS.coverage * 10) / 10,
      possible: WORKOUT_WEIGHTS.coverage,
      detail: `${worked.size}/${intended.size} muscles worked`,
    },
  ];
}

export function scoreDay(inp: DayInputs): DayScore {
  const lines: ScoreLine[] = [...workoutLines(inp)];

  lines.push({
    id: "protein",
    label: "Protein",
    earned: inp.protein ? Math.round(ratio(inp.protein.grams, inp.protein.target) * SCORE_WEIGHTS.protein * 10) / 10 : null,
    possible: SCORE_WEIGHTS.protein,
    detail: inp.protein ? `${Math.round(inp.protein.grams)}g of ${inp.protein.target}g` : "not logged",
  });

  lines.push({
    id: "calories",
    label: "Calories",
    earned: inp.calories ? Math.round(ratio(inp.calories.kcal, inp.calories.target) * SCORE_WEIGHTS.calories * 10) / 10 : null,
    possible: SCORE_WEIGHTS.calories,
    detail: inp.calories ? `${Math.round(inp.calories.kcal)} of ${inp.calories.target} kcal` : "not logged",
  });

  lines.push({
    id: "sleep",
    label: "Sleep",
    earned: inp.sleepHours != null ? Math.round(ratio(inp.sleepHours, SLEEP_TARGET_HOURS) * SCORE_WEIGHTS.sleep * 10) / 10 : null,
    possible: SCORE_WEIGHTS.sleep,
    detail: inp.sleepHours != null ? `${inp.sleepHours}h of ${SLEEP_TARGET_HOURS}h` : "not logged",
  });

  lines.push({
    id: "preworkout",
    label: "Pre-workout",
    earned:
      inp.preworkout != null
        ? Math.round(Math.max(0, Math.min(1, inp.preworkout)) * SCORE_WEIGHTS.preworkout * 10) / 10
        : null,
    possible: SCORE_WEIGHTS.preworkout,
    detail:
      inp.preworkout != null
        ? `${Math.round(inp.preworkout * 100)}% of the window's target`
        : inp.isRestDay
          ? "rest day"
          : "not logged",
  });

  lines.push({
    id: "creatine",
    label: "Creatine",
    earned: inp.creatineG != null ? (inp.creatineG >= CREATINE_TARGET_G ? SCORE_WEIGHTS.creatine : 0) : null,
    possible: SCORE_WEIGHTS.creatine,
    detail: inp.creatineG != null ? `${inp.creatineG}g` : "not logged",
  });

  const assessed = lines.filter((l) => l.earned !== null);
  const earned = assessed.reduce((t, l) => t + (l.earned ?? 0), 0);
  const tracked = assessed.reduce((t, l) => t + l.possible, 0);

  return {
    score: tracked ? Math.round((earned / tracked) * 100) : 0,
    earned: Math.round(earned * 10) / 10,
    tracked,
    lines,
    untracked: lines.filter((l) => l.earned === null).map((l) => l.label),
  };
}
