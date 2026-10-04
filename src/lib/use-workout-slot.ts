import { useMemo } from "react";
import { SomaIntelligenceEngine, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { workoutSlot, type WorkoutSlot } from "@/lib/workout-time";

export interface PlannedSession {
  slot: WorkoutSlot | null;
  /** What the programme has on that day ("Push", "Rest", …). */
  split: string;
}

type State = ReturnType<typeof useSoma.getState>;

/** The session on `date`, as Train, Time and Fuel all see it. */
export function sessionOn(date: string, st: State = useSoma.getState()): PlannedSession {
  const proj = SomaIntelligenceEngine.getProgramProjectedDay(
    parseLocalDateKey(date),
    st.settings.scheduleOverrides,
    st.activeProgram(),
  );
  return { slot: workoutSlot(date, st.settings.workoutTime, proj.isRest), split: proj.split };
}

export function usePlannedSession(date: string): PlannedSession {
  const settings = useSoma((s) => s.settings);
  const programs = useSoma((s) => s.programs);
  const activeProgramId = useSoma((s) => s.activeProgramId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => sessionOn(date), [date, settings, programs, activeProgramId]);
}
