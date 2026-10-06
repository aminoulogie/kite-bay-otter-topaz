import { useMemo } from "react";
import { SomaIntelligenceEngine, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import {
  minutesAt, savedStart, startedSlot, workoutSlot, type WorkoutSlot,
} from "@/lib/workout-time";

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
  const planned = workoutSlot(date, st.settings.workoutTime, proj.isRest);
  return { slot: startedSlot(planned, actualStart(date, st), actualMins(date, st)), split: proj.split };
}

/**
 * When training actually began on `date`, or null if it has not.
 *
 * The open session wins over the saved one: if both exist for a day you are
 * mid-way through a second session, and the one you are in is the one the
 * next meal has to be placed around.
 */
export function actualStart(date: string, st: State = useSoma.getState()): number | null {
  const live = st.live;
  if (live?.date === date && live.firstSetAt) return minutesAt(live.firstSetAt);
  return savedStart(st.history?.[date]);
}

/** The session's real length once saved; undefined while it is still running. */
function actualMins(date: string, st: State): number | undefined {
  const live = st.live;
  if (live?.date === date && live.firstSetAt) return undefined;
  const m = /^(\d+):(\d{2})$/.exec(String(st.history?.[date]?.durationFormatted ?? ""));
  return m ? Number(m[1]) : undefined;
}

export function usePlannedSession(date: string): PlannedSession {
  const settings = useSoma((s) => s.settings);
  const programs = useSoma((s) => s.programs);
  const activeProgramId = useSoma((s) => s.activeProgramId);
  // The live session and the day's record are dependencies too: the whole
  // point is that the slot moves the moment a set is logged, and a memo that
  // only watched the settings would keep handing back the planned time.
  const live = useSoma((s) => s.live);
  const history = useSoma((s) => s.history);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => sessionOn(date), [date, settings, programs, activeProgramId, live, history]);
}
