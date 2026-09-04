import { rateExercise, type Rating, type SetQuality } from "./set-quality";
import { estimated1RM, type ExerciseLog } from "./training-log";
import type { HistorySession } from "./types";

/**
 * Turn logged history into a rating per exercise.
 *
 * The rating needs the quality fields — what ended each set, and how it felt —
 * which only exist on sessions logged since those were added. Everything
 * imported from the spreadsheet has none, so those exercises come back with a
 * "low" confidence and must be shown as unrated rather than as a number that
 * looks earned.
 */

export interface RatedExercise {
  name: string;
  rating: Rating;
  /** True once there is enough quality data for the score to mean anything. */
  usable: boolean;
}

export function rateAllExercises(
  history: Record<string, HistorySession>,
  log: ExerciseLog[],
): Map<string, RatedExercise> {
  const setsByName = new Map<string, SetQuality[]>();
  const pumpsByName = new Map<string, number[]>();
  const axialByName = new Map<string, boolean>();

  for (const session of Object.values(history || {})) {
    for (const ex of session?.exercises ?? []) {
      const done = (ex.sets ?? []).filter((s) => s.done);
      if (done.length) {
        setsByName.set(ex.name, [...(setsByName.get(ex.name) ?? []), ...done]);
      }
      if (ex.pump) pumpsByName.set(ex.name, [...(pumpsByName.get(ex.name) ?? []), ex.pump]);
      if (ex.isAxial) axialByName.set(ex.name, true);
    }
  }

  const out = new Map<string, RatedExercise>();
  for (const entry of log) {
    // Estimated 1RM per session, oldest first, so the progression term reads a
    // trend rather than a scatter.
    const e1rmByDate = Object.entries(entry.days)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, sets]) => ({
        date,
        value: sets.reduce((m, s) => Math.max(m, estimated1RM(s)), 0),
      }))
      .filter((p) => p.value > 0);

    const sets = setsByName.get(entry.name) ?? [];
    const rating = rateExercise({
      sets,
      pumps: pumpsByName.get(entry.name) ?? [],
      e1rmByDate,
      isAxial: axialByName.get(entry.name) ?? false,
    });

    out.set(entry.name, {
      name: entry.name,
      rating,
      // Below this the score is mostly noise, and presenting it would imply a
      // judgement the data cannot support.
      usable: rating.sampleSets >= 5,
    });
  }
  return out;
}

/** Plain-language read on a 0-10 rating. */
export function ratingLabel(score: number): string {
  if (score >= 8) return "excellent";
  if (score >= 6.5) return "strong";
  if (score >= 5) return "useful";
  if (score >= 3) return "weak";
  return "poor";
}

export function ratingTone(score: number): string {
  if (score >= 8) return "text-emerald-400";
  if (score >= 6.5) return "text-lime-400";
  if (score >= 5) return "text-amber-400";
  return "text-orange-400";
}

/**
 * Why a rating came out where it did, biggest contributor first.
 *
 * A bare number invites arguing with it; the breakdown makes it checkable, and
 * points at what would actually change the score.
 */
export function ratingBreakdown(rating: Rating): { label: string; pct: number }[] {
  const labels: Record<string, string> = {
    onTarget: "Target muscle fails",
    sensation: "Pump and burn",
    progression: "Getting stronger",
    reliability: "Delivers consistently",
    efficiency: "Stimulus vs fatigue",
  };
  return Object.entries(rating.parts)
    .map(([k, v]) => ({ label: labels[k] ?? k, pct: Math.round(v * 100) }))
    .sort((a, b) => b.pct - a.pct);
}
