/**
 * A running routine, as the lock screen's Live Activity needs it.
 *
 * Absolute times, not "seconds left": the lock screen counts down from a date
 * by itself while the app is asleep, so the app only has to say something
 * when the run changes — a step finished, skipped, paused or resumed.
 */
import { clampStep, isFinished, spans, stepLeftSeconds, type Routine, type RunState } from "./routine.ts";

export interface ActivityState {
  name: string;
  color: string;
  stepLabel: string;
  nextLabel?: string;
  stepIndex: number;
  stepCount: number;
  /** Epoch ms. */
  stepStart: number;
  stepEnd: number;
  paused: boolean;
  pausedLeft: number;
  windowEnd: number;
}

/** Null when there is nothing to show: no run, or the run is over. */
export function activityState(
  routine: Routine | undefined,
  run: RunState | null | undefined,
  now = Date.now(),
): ActivityState | null {
  if (!routine || !run || isFinished(routine, run)) return null;
  const list = spans(routine);
  const cur = list[run.index];
  if (!cur) return null;
  const stepMs = clampStep(cur.step.seconds) * 1000;
  const paused = !!run.pausedAt;
  // While paused the step's clock is stopped: it is shown from where it
  // stopped, and its start is shifted so the bar still reads right.
  const left = stepLeftSeconds(routine, run, run.pausedAt ?? now);
  const stepStart = paused ? now - (stepMs - left * 1000) : run.stepStartedAt;
  const windowMs = (Number(routine.windowSeconds) || 0) * 1000;
  const pausedSoFar = (run.pausedMs || 0) + (paused ? now - (run.pausedAt ?? now) : 0);
  return {
    name: routine.name,
    color: routine.color,
    stepLabel: cur.step.label,
    nextLabel: list[run.index + 1]?.step.label,
    stepIndex: run.index,
    stepCount: list.length,
    stepStart,
    stepEnd: stepStart + stepMs,
    paused,
    pausedLeft: Math.max(0, left),
    windowEnd: run.startedAt + pausedSoFar + windowMs,
  };
}
