import { useMemo } from "react";
import { buildTrainingLog, type ExerciseLog } from "./training-log";
import { useSoma } from "./store";

export function useTrainingLog(): ExerciseLog[] {
  const history = useSoma((s) => s.history);
  const live = useSoma((s) => s.live);
  const nutrition = useSoma((s) => s.nutrition);
  const archive = useSoma((s) => s.sessionArchive);

  const bodyweights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.bodyWeight) out[d] = day.bodyWeight;
    }
    return out;
  }, [nutrition]);

  return useMemo(
    () => buildTrainingLog(history, bodyweights, { archive: archive ?? [], live }),
    [history, bodyweights, archive, live],
  );
}
