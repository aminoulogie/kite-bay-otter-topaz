import { useMemo } from "react";
import { buildTrainingLog, type ExerciseLog } from "./training-log";
import { useSoma } from "./store";

/**
 * The flat training log, built once from every source that feeds it.
 *
 * Four screens were each assembling this themselves — the Database, both graph
 * views and Ahead — and three of them were missing the corrections layer, so
 * fixing a set in the table changed the table and nothing else. The charts kept
 * drawing the number you had just deleted.
 *
 * One hook, so a correction reaches everything derived from the log by
 * construction rather than by remembering to pass an argument in four places.
 */
export function useTrainingLog(): ExerciseLog[] {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const logOverrides = useSoma((s) => s.logOverrides);

  // Bodyweight lifts carry the body's own load, which lives in the food log.
  const bodyweights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.bodyWeight) out[d] = day.bodyWeight;
    }
    return out;
  }, [nutrition]);

  return useMemo(
    () => buildTrainingLog(history, bodyweights, logOverrides),
    [history, bodyweights, logOverrides],
  );
}
