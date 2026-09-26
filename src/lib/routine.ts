/**
 * A routine: several things done back to back, against a clock.
 *
 * The problem it solves is specific. A morning has five things in it and
 * twenty minutes to do them in, and the failure is never "I forgot one" — it
 * is spending nine minutes on the first and discovering at the door that there
 * was no time for the rest. A checklist cannot tell you that. It shows five
 * unticked boxes whether you are two minutes in or eighteen.
 *
 * So a routine is a list of steps WITH durations, run against a single window,
 * and the only number that matters while it is running is whether you are
 * ahead or behind. Everything else on the screen is decoration for that.
 *
 * Three decisions worth stating, because each is the opposite of the obvious:
 *
 * **The window is the truth, not the sum of the steps.** You say "twenty
 * minutes" and the steps are fitted into it. A routine whose steps add to
 * twenty-five minutes in a twenty-minute window is over-committed, and it says
 * so rather than quietly running to twenty-five — the same rule the day plan
 * uses, for the same reason.
 *
 * **Overrun is carried, not absorbed.** Spending three minutes on a
 * ninety-second step does not shrink the next one. It puts you three minutes
 * behind, and you see that, because the whole point is to know now rather than
 * at the door.
 *
 * **A step is finished when you say so, not when its timer ends.** The clock
 * running out is information, not an event. Auto-advancing would tick things
 * you had not done, which would make the record a lie — and the record is what
 * the habit tab reads.
 */

export type StepSource = "habit" | "todo" | "free";

export interface RoutineStep {
  id: string;
  label: string;
  /** Seconds this step is allowed. Always > 0. */
  seconds: number;
  /** Where it came from, so finishing it can tick the real thing. */
  source: StepSource;
  /** The habit or to-do id, when the step stands for one. */
  refId?: string;
  /**
   * A rest the focus queue inserted between two work steps (Pomodoro mode).
   * Always `source: "free"`, so finishing it can never tick anything; the flag
   * only exists so the queue does not offer a break after a break.
   */
  isBreak?: boolean;
}

export interface Routine {
  id: string;
  name: string;
  /** The whole window, in seconds. The steps are fitted to it. */
  windowSeconds: number;
  steps: RoutineStep[];
  color: string;
  createdAt: number;
}

/** Nothing shorter is a step; it is a thought. */
export const MIN_STEP_SECONDS = 15;

/** The longest a single step can be, so one typo cannot eat a whole morning. */
export const MAX_STEP_SECONDS = 4 * 3600;

export const ROUTINE_COLORS = [
  "#5b8cff", "#35c9a8", "#f0a63c", "#e2607a",
  "#9b7bf0", "#3fb6f0", "#5ecf7a", "#e0785a",
];

let seq = 0;
export function newRoutineId(): string {
  seq += 1;
  return `rt-${Date.now().toString(36)}-${seq.toString(36)}`;
}
export function newStepId(): string {
  seq += 1;
  return `rs-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function stepsOf(routine: Routine | undefined): RoutineStep[] {
  return Array.isArray(routine?.steps) ? routine.steps : [];
}

export function clampStep(seconds: unknown): number {
  const n = Math.round(Number(seconds) || 0);
  if (!Number.isFinite(n) || n <= 0) return MIN_STEP_SECONDS;
  return Math.max(MIN_STEP_SECONDS, Math.min(MAX_STEP_SECONDS, n));
}

/** The steps' own total, which is not necessarily the window. */
export function plannedSeconds(routine: Routine | undefined): number {
  return stepsOf(routine).reduce((a, s) => a + clampStep(s.seconds), 0);
}

/** Seconds spare in the window, or negative when over-committed. */
export function slackSeconds(routine: Routine | undefined): number {
  return Math.round((Number(routine?.windowSeconds) || 0) - plannedSeconds(routine));
}

export function isOverCommitted(routine: Routine | undefined): boolean {
  return slackSeconds(routine) < 0;
}

/**
 * Where each step starts and ends inside the window, in seconds.
 *
 * Laid out back to back from zero. Deliberately NOT scaled to fit the window:
 * a step that says ninety seconds means ninety seconds, and squeezing it to
 * make the arithmetic work would be the app quietly deciding you can brush
 * your teeth faster.
 */
export interface StepSpan {
  step: RoutineStep;
  index: number;
  startSeconds: number;
  endSeconds: number;
}

export function spans(routine: Routine | undefined): StepSpan[] {
  const out: StepSpan[] = [];
  let cursor = 0;
  stepsOf(routine).forEach((step, index) => {
    const seconds = clampStep(step.seconds);
    out.push({ step, index, startSeconds: cursor, endSeconds: cursor + seconds });
    cursor += seconds;
  });
  return out;
}

// ------------------------------------------------------------------ run --

export interface RunState {
  routineId: string;
  /** Epoch ms when the whole run began. */
  startedAt: number;
  /** Epoch ms when the CURRENT step began. */
  stepStartedAt: number;
  index: number;
  /** Ids of the steps finished so far, in the order they were finished. */
  done: string[];
  /** Set when the run is paused; the elapsed clock stops here. */
  pausedAt?: number;
  /** Total ms spent paused, so a pause does not count as being behind. */
  pausedMs: number;
  /**
   * step id -> seconds actually spent on it, written as each step is finished
   * or skipped. Optional because runs saved before it existed have none, and
   * nothing about running a routine depends on it — it is the record the
   * focus log and the habit time targets read afterwards.
   */
  spent?: Record<string, number>;
}

export function startRun(routine: Routine, now = Date.now()): RunState {
  return {
    routineId: routine.id,
    startedAt: now,
    stepStartedAt: now,
    index: 0,
    done: [],
    pausedMs: 0,
  };
}

/** Milliseconds the run has been going, pauses removed. */
export function elapsedMs(run: RunState | undefined, now = Date.now()): number {
  if (!run) return 0;
  const end = run.pausedAt ?? now;
  return Math.max(0, end - run.startedAt - (run.pausedMs || 0));
}

/** Milliseconds the current step has been going, pauses removed. */
export function stepElapsedMs(run: RunState | undefined, now = Date.now()): number {
  if (!run) return 0;
  const end = run.pausedAt ?? now;
  return Math.max(0, end - run.stepStartedAt);
}

/**
 * Ahead or behind, in seconds. Positive is ahead.
 *
 * Measured against where the PLAN says you should be — the end of the last
 * finished step — rather than against the window. Someone three steps in at
 * minute four, on a plan that wanted them at minute six, is two minutes ahead
 * even though eighty percent of the window is still unspent.
 */
export function driftSeconds(
  routine: Routine | undefined,
  run: RunState | undefined,
  now = Date.now(),
): number {
  if (!routine || !run) return 0;
  const list = spans(routine);
  const at = Math.max(0, Math.min(list.length, run.index));
  const shouldBe = at === 0 ? 0 : (list[at - 1]?.endSeconds ?? 0);
  return Math.round(shouldBe - elapsedMs(run, now) / 1000);
}

/**
 * Drift smaller than this is noise, not news.
 *
 * Without a band the screen says "0:01 behind" in red one second after you
 * start, because the plan wanted you at zero and you are at one. That is true
 * and useless: it trains you to ignore the one number the screen exists to
 * show. Fifteen seconds is about the point where it is worth acting on.
 */
export const ON_TIME_SECONDS = 15;

export type Pace = "ahead" | "on-time" | "behind";

export function paceOf(drift: number): Pace {
  const n = Math.round(Number(drift) || 0);
  if (Math.abs(n) <= ON_TIME_SECONDS) return "on-time";
  return n > 0 ? "ahead" : "behind";
}

/** Seconds left in the current step; negative once it has overrun. */
export function stepLeftSeconds(
  routine: Routine | undefined,
  run: RunState | undefined,
  now = Date.now(),
): number {
  const list = spans(routine);
  const cur = list[run?.index ?? -1];
  if (!cur) return 0;
  return Math.round(clampStep(cur.step.seconds) - stepElapsedMs(run, now) / 1000);
}

/** Seconds left in the whole window; negative once it has overrun. */
export function windowLeftSeconds(
  routine: Routine | undefined,
  run: RunState | undefined,
  now = Date.now(),
): number {
  const total = Number(routine?.windowSeconds) || 0;
  return Math.round(total - elapsedMs(run, now) / 1000);
}

export function isFinished(routine: Routine | undefined, run: RunState | undefined): boolean {
  if (!routine || !run) return false;
  return run.index >= stepsOf(routine).length;
}

/** Finish the current step and move on. */
export function completeStep(
  routine: Routine,
  run: RunState,
  now = Date.now(),
): RunState {
  const list = stepsOf(routine);
  const cur = list[run.index];
  if (!cur) return run;
  return {
    ...run,
    index: run.index + 1,
    stepStartedAt: now,
    done: run.done.includes(cur.id) ? run.done : [...run.done, cur.id],
    spent: recordSpent(run, cur.id, now),
  };
}

/** The spent map with the current step's time added, pauses removed. */
function recordSpent(run: RunState, stepId: string, now: number): Record<string, number> {
  const prior = run.spent ?? {};
  const secs = Math.round(stepElapsedMs(run, now) / 1000);
  return { ...prior, [stepId]: (prior[stepId] ?? 0) + secs };
}

/**
 * Skip the current step without marking it done.
 *
 * Separate from completing it, and the difference is the whole reason the
 * record can be trusted: a skipped step must not tick the habit it stands for.
 */
export function skipStep(routine: Routine, run: RunState, now = Date.now()): RunState {
  const list = stepsOf(routine);
  const cur = list[run.index];
  if (!cur) return run;
  return { ...run, index: run.index + 1, stepStartedAt: now, spent: recordSpent(run, cur.id, now) };
}

export function pauseRun(run: RunState, now = Date.now()): RunState {
  return run.pausedAt ? run : { ...run, pausedAt: now };
}

export function resumeRun(run: RunState, now = Date.now()): RunState {
  if (!run.pausedAt) return run;
  return {
    ...run,
    pausedMs: (run.pausedMs || 0) + Math.max(0, now - run.pausedAt),
    // The current step's clock is pushed forward by the pause too, or a step
    // paused for ten minutes reads as ten minutes overrun.
    stepStartedAt: run.stepStartedAt + Math.max(0, now - run.pausedAt),
    pausedAt: undefined,
  };
}

// --------------------------------------------------------------- format --

/** "1:30", "12:05", "-0:20". Always minutes and seconds; a routine is short. */
export function clock(seconds: number): string {
  const n = Math.round(Number(seconds) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}

/** "20 min", "1h 05m" — for a window rather than a countdown. */
export function duration(seconds: number): string {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.round(n / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

/** A routine read back from storage, with every field made safe. */
export function cleanRoutine(raw: unknown): Routine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Routine>;
  if (typeof r.id !== "string" || !r.id) return null;
  const steps = Array.isArray(r.steps)
    ? r.steps
        .filter((s): s is RoutineStep => !!s && typeof s.id === "string" && typeof s.label === "string")
        .map((s) => ({
          id: s.id,
          label: s.label,
          seconds: clampStep(s.seconds),
          source: s.source === "habit" || s.source === "todo" ? s.source : ("free" as StepSource),
          refId: typeof s.refId === "string" ? s.refId : undefined,
          ...(s.isBreak === true ? { isBreak: true } : {}),
        }))
    : [];
  return {
    id: r.id,
    name: typeof r.name === "string" && r.name.trim() ? r.name : "Routine",
    windowSeconds: Math.max(60, Math.round(Number(r.windowSeconds) || 0) || 20 * 60),
    steps,
    color: typeof r.color === "string" && r.color ? r.color : ROUTINE_COLORS[0]!,
    createdAt: Number(r.createdAt) || Date.now(),
  };
}
