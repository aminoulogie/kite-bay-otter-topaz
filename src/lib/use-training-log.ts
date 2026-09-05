import { useMemo } from "react";
import { buildTrainingLog, type ExerciseLog } from "./training-log";
import { useSoma } from "./store";
import type { HistorySession } from "./types";

export function useTrainingLog(): ExerciseLog[] {
  const history = useSoma((s) => s.history);
  const live = useSoma((s) => s.live);
  const nutrition = useSoma((s) => s.nutrition);
  const extra = useSoma((s) => (s as { sessionArchive?: HistorySession[] }).sessionArchive);

  const bodyweights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.bodyWeight) out[d] = day.bodyWeight;
    }
    return out;
  }, [nutrition]);

  return useMemo(
    () => buildTrainingLog(history, bodyweights, { archive: extra ?? [], live }),
    [history, bodyweights, extra, live],
  );
}
