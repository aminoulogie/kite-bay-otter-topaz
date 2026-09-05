import { useMemo } from "react";
import { buildTrainingLog, type ExerciseLog } from "./training-log";
import { useSoma } from "./store";

/**
 * One training log for Database, graphs, micro-muscle and Ahead.
 *
 * Includes saved sessions, extra same-day sessions, and the live sheet if
 * anything has been ticked — so a workout you have not pressed Save on still
 * appears instead of looking like the imported spreadsheet is the whole log.
 */
export function useTrainingLog(): ExerciseLog[] {
  const history = useSoma((s) => s.history);
  const sessionArchive = useSoma((s) => s.sessionArchive);
  const live = useSoma((s) => s.live);
  const nutrition = useSoma((s) => s.nutrition);

  const bodyweights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.bodyWeight) out[d] = day.bodyWeight;
    }
    return out;
  }, [nutrition]);

  return useMemo(
    () => buildTrainingLog(history, bodyweights, { archive: sessionArchive, live }),
    [history, bodyweights, sessionArchive, live],
  );
}
