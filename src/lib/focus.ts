/**
 * Focus: today's to-dos and habits, run one after another against a clock.
 *
 * A routine is a list you keep and run again tomorrow. The focus queue is the
 * one-shot version — "these four things, in this order, now" — built fresh
 * each day out of whatever is actually on today's lists. It is deliberately
 * NOT a second runner. The queue is turned into an ordinary `Routine` (id
 * `focus:<date>`) and run by the same `RunState`, the same `RoutineRunner` and
 * the same step-finishing path, so everything a routine already gets right —
 * drift, pauses, "a step is done when you say so", ticking the real habit —
 * the queue gets right for free.
 *
 * Why a synthetic routine rather than a parallel `focusRun`: a second run
 * shape would mean a second copy of every function in routine.ts, and two
 * copies of "skip must not tick the habit" is how one of them stops being
 * true. The only thing the runner needs to know is which list it is reading,
 * and the id prefix says that.
 *
 * The rules this file adds on top of routine.ts:
 *
 * **Todos and habits stay the truth.** A queue item is a pointer (`refId`),
 * never a copy. Finishing it ticks the real thing; ticking the real thing
 * elsewhere shows up here as already done.
 *
 * **Everything is a timestamp.** A run survives a locked screen and a killed
 * process because nothing in it is a counter — the remaining time is always
 * recomputed from `stepStartedAt`, and it is never allowed to read negative
 * on the lock screen.
 *
 * **The day plan is not rewritten.** Pulling flexible blocks INTO the queue
 * reads the ring; nothing here writes it back. The 24-hour invariant belongs
 * to day-plan.ts alone.
 */

import {
  MAX_STEP_SECONDS, clampStep, isFinished, newStepId, stepElapsedMs, stepLeftSeconds,
  stepsOf, type Routine, type RoutineStep, type RunState, type StepSource,
} from "./routine.ts";
import { arcs, blockAtHour, DAY_HOURS, type Arc, type TimeBlock } from "./day-plan.ts";

// ------------------------------------------------------------ identity --

export const FOCUS_PREFIX = "focus:";

/** The run id for a date's queue. */
export function focusIdFor(date: string): string {
  return `${FOCUS_PREFIX}${date}`;
}

export function isFocusId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith(FOCUS_PREFIX);
}

/** The date a focus run belongs to, or null for a routine's run. */
export function focusDateOf(id: string | undefined | null): string | null {
  return isFocusId(id) ? id!.slice(FOCUS_PREFIX.length) : null;
}

export const FOCUS_COLOR = "#35c9a8";

/**
 * The queue as a routine the runner can read.
 *
 * The window is the queue's own total. A one-shot list has no separate
 * window to be fitted into — the day plan is where that constraint lives —
 * so drift is measured against the durations you allocated, which is the
 * question worth answering: am I on the pace I set myself.
 */
export function queueAsRoutine(date: string, items: RoutineStep[], color = FOCUS_COLOR): Routine {
  const steps = Array.isArray(items) ? items : [];
  const total = steps.reduce((a, s) => a + clampStep(s.seconds), 0);
  return {
    id: focusIdFor(date),
    name: "Focus",
    windowSeconds: Math.max(60, total),
    steps,
    color,
    createdAt: 0,
  };
}

/**
 * The routine a run is reading — a saved one, or a date's focus queue.
 *
 * The one place that answers "which list is this run on", so the runner, the
 * lock screen and the session log can never disagree about it.
 */
export function routineForRun(
  run: Pick<RunState, "routineId"> | null | undefined,
  routines: readonly Routine[],
  queues: Record<string, RoutineStep[]> | undefined,
): Routine | null {
  if (!run) return null;
  const date = focusDateOf(run.routineId);
  if (date) return queueAsRoutine(date, queues?.[date] ?? []);
  return routines.find((r) => r.id === run.routineId) ?? null;
}

// ----------------------------------------------------------- durations --

/** A focused block of real work: the classic Pomodoro. */
export const DEEP_WORK_SECONDS = 25 * 60;
/** Most habits are short; a routine step defaulted to this already. */
export const HABIT_SECONDS = 5 * 60;
export const BREAK_SECONDS = 5 * 60;

/** Minutes people actually allocate. Anything else is one field away. */
export const FOCUS_MINUTES = [5, 10, 15, 20, 25, 30, 45, 60, 90];

export interface FocusPrefs {
  /** Offer a break after each work step. */
  pomodoro: boolean;
  workSeconds: number;
  breakSeconds: number;
  /** "habit:<id>" / "todo:<id>" -> the duration last given to it. */
  lastSeconds: Record<string, number>;
}

export function defaultFocusPrefs(): FocusPrefs {
  return {
    pomodoro: false,
    workSeconds: DEEP_WORK_SECONDS,
    breakSeconds: BREAK_SECONDS,
    lastSeconds: {},
  };
}

/** Prefs read back from storage, every field made safe. */
export function cleanFocusPrefs(raw: unknown): FocusPrefs {
  const d = defaultFocusPrefs();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<FocusPrefs>;
  const last: Record<string, number> = {};
  if (r.lastSeconds && typeof r.lastSeconds === "object") {
    for (const [k, v] of Object.entries(r.lastSeconds)) {
      if (Number(v) > 0) last[k] = clampStep(v);
    }
  }
  return {
    pomodoro: r.pomodoro === true,
    workSeconds: r.workSeconds ? clampStep(r.workSeconds) : d.workSeconds,
    breakSeconds: r.breakSeconds ? clampStep(r.breakSeconds) : d.breakSeconds,
    lastSeconds: last,
  };
}

export function refKey(source: StepSource, refId?: string): string {
  return refId ? `${source}:${refId}` : source;
}

/**
 * A sensible first guess, so allocating time is one tap rather than a form.
 *
 * In order: whatever you gave this exact habit or to-do last time (people
 * are consistent about how long things take them); then the habit's own
 * "roughly how long"; then a default by kind — five minutes for a habit,
 * one work block for anything else.
 */
export function suggestSeconds(
  source: StepSource,
  refId: string | undefined,
  prefs: Pick<FocusPrefs, "lastSeconds" | "workSeconds">,
  habitSeconds?: number,
): number {
  const last = refId ? prefs.lastSeconds?.[refKey(source, refId)] : undefined;
  if (last && last > 0) return clampStep(last);
  if (source === "habit" && habitSeconds && habitSeconds > 0) return clampStep(habitSeconds);
  if (source === "habit") return HABIT_SECONDS;
  return clampStep(prefs.workSeconds || DEEP_WORK_SECONDS);
}

/** Remember a duration for next time; free items have nothing to key on. */
export function rememberSeconds(
  last: Record<string, number>,
  source: StepSource,
  refId: string | undefined,
  seconds: number,
): Record<string, number> {
  if (!refId || source === "free") return last;
  return { ...last, [refKey(source, refId)]: clampStep(seconds) };
}

// --------------------------------------------------------------- queue --

export interface NewItem {
  label: string;
  seconds: number;
  source: StepSource;
  refId?: string;
}

export function makeItem(input: NewItem): RoutineStep {
  return {
    id: newStepId(),
    label: input.label.trim() || "Focus",
    seconds: clampStep(input.seconds),
    source: input.source,
    ...(input.refId ? { refId: input.refId } : {}),
  };
}

/**
 * Append, once. The same to-do queued twice would be ticked by the first and
 * un-ticked by nothing — but it would still sit there asking to be done, and
 * a list that asks you to do a finished thing is a list you stop trusting.
 */
export function addToQueue(items: RoutineStep[], item: RoutineStep): RoutineStep[] {
  const list = Array.isArray(items) ? items : [];
  if (item.refId && list.some((s) => s.refId === item.refId && !s.isBreak)) return list;
  return [...list, item];
}

export function removeFromQueue(items: RoutineStep[], id: string): RoutineStep[] {
  return (items ?? []).filter((s) => s.id !== id);
}

export function patchQueueSeconds(items: RoutineStep[], id: string, seconds: number): RoutineStep[] {
  return (items ?? []).map((s) => (s.id === id ? { ...s, seconds: clampStep(seconds) } : s));
}

/**
 * Move one item, never across `floor`.
 *
 * While a run is going, everything up to and including the current step has
 * already been decided — it is done, skipped, or on the clock — and the run
 * finds its place by index. Letting a later item jump in front of it would
 * silently change which step the clock belongs to. So a running queue can be
 * reordered only after the step you are on.
 */
export function moveInQueue(
  items: RoutineStep[],
  id: string,
  to: number,
  floor = 0,
): RoutineStep[] {
  const list = [...(items ?? [])];
  const from = list.findIndex((s) => s.id === id);
  if (from < 0 || from < floor) return items;
  const target = Math.max(floor, Math.min(list.length - 1, Math.floor(to)));
  if (target === from) return items;
  const [it] = list.splice(from, 1);
  list.splice(target, 0, it!);
  return list;
}

/**
 * Pomodoro: a short break after a work step, but only between two work steps.
 *
 * Not after a break (two breaks in a row is a nap), and not after the last
 * step — a break with nothing after it is just the end of the session.
 */
export function insertBreakAfter(
  items: RoutineStep[],
  index: number,
  seconds = BREAK_SECONDS,
): RoutineStep[] {
  const list = items ?? [];
  const cur = list[index];
  const next = list[index + 1];
  if (!cur || cur.isBreak || !next || next.isBreak) return list;
  const brk: RoutineStep = {
    id: newStepId(),
    label: "Break",
    seconds: clampStep(seconds),
    source: "free",
    isBreak: true,
  };
  return [...list.slice(0, index + 1), brk, ...list.slice(index + 1)];
}

/**
 * What is left once a run is over: the steps that were finished go, and so do
 * the breaks. Skipped steps stay, because skipping means "not now", and the
 * queue is today's list of what is still to do.
 */
export function pruneFinished(items: RoutineStep[], done: readonly string[]): RoutineStep[] {
  const gone = new Set(done ?? []);
  return (items ?? []).filter((s) => !s.isBreak && !gone.has(s.id));
}

/** The next few things, for the dashboard's glance. */
export function nextUp(items: RoutineStep[], fromIndex = 0, n = 3): RoutineStep[] {
  return (items ?? []).slice(Math.max(0, fromIndex)).filter((s) => !s.isBreak).slice(0, n);
}

// ------------------------------------------------------------ day plan --

/**
 * Flexible blocks as queue items. Fixed ones are left alone.
 *
 * Fixed means "this is already spoken for" — sleep, work, the commute — and
 * a focus run is a plan for the time that is not. Capped at the longest a
 * step can be, so a five-hour free evening becomes one four-hour block rather
 * than a rejected one. A block already in the queue is not added twice.
 */
export function itemsFromPlan(blocks: TimeBlock[], existing: RoutineStep[] = []): RoutineStep[] {
  const have = new Set(existing.map((s) => s.refId).filter(Boolean));
  return (blocks ?? [])
    .filter((b) => !b.fixed && Number(b.hours) > 0 && !have.has(blockRef(b.id)))
    .map((b) =>
      makeItem({
        label: b.label,
        seconds: Math.min(MAX_STEP_SECONDS, Math.round(Number(b.hours) * 3600)),
        source: "free",
        refId: blockRef(b.id),
      }),
    );
}

/** A free item pulled from the ring remembers which block it came from. */
export function blockRef(blockId: string): string {
  return `block:${blockId}`;
}

export interface NowInPlan {
  arc: Arc;
  /** Hours left in the current block, never negative. */
  leftHours: number;
}

/** The block the clock is in right now, and how much of it is left. */
export function nowInPlan(blocks: TimeBlock[], hour: number): NowInPlan | null {
  const list = arcs(blocks);
  const arc = blockAtHour(list, hour);
  if (!arc) return null;
  const start = arc.startHour % DAY_HOURS;
  const length = arc.endHour - arc.startHour;
  let h = ((Number(hour) || 0) % DAY_HOURS + DAY_HOURS) % DAY_HOURS;
  if (h < start) h += DAY_HOURS;
  return { arc, leftHours: Math.max(0, start + length - h) };
}

// -------------------------------------------------------------- resume --

/** A run older than this is a morning that is over, not one to resume. */
export const STALE_RUN_MS = 18 * 3600 * 1000;

/**
 * A run read back after the app was killed, or null when it should not be.
 *
 * Clocks can move backwards (a manual time change, a restore onto another
 * phone) and a start in the future would read as a step with more time left
 * than it was given, so every timestamp is clamped to now.
 */
export function reviveRun(raw: unknown, now = Date.now()): RunState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<RunState>;
  if (typeof r.routineId !== "string" || !r.routineId) return null;
  const startedAt = Number(r.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  if (now - startedAt > STALE_RUN_MS) return null;
  const clamp = (n: unknown) => Math.min(now, Number(n) || now);
  return {
    routineId: r.routineId,
    startedAt: clamp(startedAt),
    stepStartedAt: clamp(r.stepStartedAt),
    index: Math.max(0, Math.floor(Number(r.index) || 0)),
    done: Array.isArray(r.done) ? r.done.filter((x): x is string => typeof x === "string") : [],
    pausedMs: Math.max(0, Number(r.pausedMs) || 0),
    ...(r.pausedAt ? { pausedAt: clamp(r.pausedAt) } : {}),
    ...(r.spent && typeof r.spent === "object" ? { spent: { ...r.spent } } : {}),
  };
}

// -------------------------------------------------------- live snapshot --

/**
 * Everything the lock screen needs, and nothing it would have to work out.
 *
 * The Live Activity cannot run JavaScript, so it is handed the step's END
 * TIME and draws its own countdown from that (`Text(timerInterval:)`). That
 * is why nothing here needs pushing every second: the system ticks the
 * number, and the app only speaks up when something the user did changes it
 * — a new step, a pause, the end.
 */
export interface LiveSnapshot {
  title: string;
  label: string;
  /** 1-based position of the current step. */
  position: number;
  total: number;
  color: string;
  paused: boolean;
  finished: boolean;
  /** Never negative: an overrun step reads 0:00 on the lock screen. */
  remainingSeconds: number;
  /** Epoch ms when the current step started, pauses removed. */
  stepStartedAt: number;
  /** Epoch ms when the current step's time runs out; null while paused. */
  stepEndsAt: number | null;
  nextLabel: string | null;
}

export function snapshotOf(routine: Routine, run: RunState, now = Date.now()): LiveSnapshot {
  const steps = stepsOf(routine);
  const finished = isFinished(routine, run);
  const cur = steps[run.index];
  const secs = cur ? clampStep(cur.seconds) : 0;
  const remaining = Math.max(0, stepLeftSeconds(routine, run, now));
  const paused = !!run.pausedAt;
  // While paused, stepStartedAt is still the pre-pause start; the end is only
  // meaningful once the clock is running again.
  const startedAt = paused ? now - stepElapsedMs(run, now) : run.stepStartedAt;
  return {
    title: routine.name,
    label: finished ? "All done" : (cur?.label ?? ""),
    position: Math.min(steps.length, run.index + 1),
    total: steps.length,
    color: routine.color,
    paused,
    finished,
    remainingSeconds: finished ? 0 : remaining,
    stepStartedAt: startedAt,
    stepEndsAt: finished || paused || !cur ? null : run.stepStartedAt + secs * 1000,
    nextLabel: steps[run.index + 1]?.label ?? null,
  };
}

/**
 * The parts of a snapshot that are worth telling the lock screen about.
 *
 * Remaining seconds are left out on purpose: they change every second, and
 * the countdown on the lock screen derives them itself from the end time.
 */
export function snapshotKey(s: LiveSnapshot): string {
  return [s.label, s.position, s.total, s.paused, s.finished, s.stepEndsAt, s.color].join("|");
}

// ----------------------------------------------------------------- log --

export interface FocusSession {
  id: string;
  date: string;
  kind: "focus" | "routine";
  name: string;
  startedAt: number;
  endedAt: number;
  /** Seconds the steps were allocated. */
  plannedSeconds: number;
  /** Seconds actually spent, pauses removed. */
  spentSeconds: number;
  steps: number;
  done: number;
  /** Seconds spent per kind of step. Breaks are counted separately. */
  bySource: Record<StepSource | "break", number>;
}

/** Keeps storage tiny: a few months of daily runs, then the oldest go. */
export const MAX_LOG = 150;

/**
 * Seconds spent per step, including the one still on the clock if the run
 * was ended part-way through it — ending early does not make the time you
 * already put in disappear.
 */
export function spentPerStep(routine: Routine, run: RunState, now = Date.now()): Record<string, number> {
  const out: Record<string, number> = { ...(run.spent ?? {}) };
  const cur = stepsOf(routine)[run.index];
  if (cur) {
    out[cur.id] = (out[cur.id] ?? 0) + Math.round(stepElapsedMs(run, now) / 1000);
  }
  return out;
}

/** "habit:<id>" / "todo:<id>" / "free" / "break" -> seconds. */
export function spentByRef(routine: Routine, run: RunState, now = Date.now()): Record<string, number> {
  const per = spentPerStep(routine, run, now);
  const out: Record<string, number> = {};
  for (const s of stepsOf(routine)) {
    const secs = per[s.id] ?? 0;
    if (secs <= 0) continue;
    const key = s.isBreak ? "break" : s.source === "free" ? "free" : refKey(s.source, s.refId);
    out[key] = (out[key] ?? 0) + secs;
  }
  return out;
}

export function addSpent(
  into: Record<string, number> | undefined,
  delta: Record<string, number>,
): Record<string, number> {
  const out = { ...(into ?? {}) };
  for (const [k, v] of Object.entries(delta)) {
    if (v > 0) out[k] = (out[k] ?? 0) + Math.round(v);
  }
  return out;
}

let logSeq = 0;
export function summarise(
  routine: Routine,
  run: RunState,
  date: string,
  now = Date.now(),
): FocusSession {
  const steps = stepsOf(routine);
  const per = spentPerStep(routine, run, now);
  const bySource: FocusSession["bySource"] = { habit: 0, todo: 0, free: 0, break: 0 };
  for (const s of steps) {
    const secs = per[s.id] ?? 0;
    bySource[s.isBreak ? "break" : s.source] += secs;
  }
  logSeq += 1;
  return {
    id: `fs-${now.toString(36)}-${logSeq.toString(36)}`,
    date,
    kind: isFocusId(routine.id) ? "focus" : "routine",
    name: routine.name,
    startedAt: run.startedAt,
    endedAt: now,
    plannedSeconds: steps.filter((s) => !s.isBreak).reduce((a, s) => a + clampStep(s.seconds), 0),
    // The sum of the steps rather than the run's wall clock: a run left on
    // its "finished" screen for ten minutes did not take ten minutes longer.
    spentSeconds: Object.values(per).reduce((a, v) => a + (Number(v) || 0), 0),
    steps: steps.filter((s) => !s.isBreak).length,
    done: steps.filter((s) => !s.isBreak && run.done.includes(s.id)).length,
    bySource,
  };
}

/** Newest last, capped. A session that ran for nothing is not worth a row. */
export function appendLog(log: FocusSession[], entry: FocusSession): FocusSession[] {
  if (entry.spentSeconds < 5 && entry.done === 0) return log ?? [];
  return [...(log ?? []), entry].slice(-MAX_LOG);
}

/** 0-100, for Insights. A run with no steps completed nothing. */
export function completionRate(s: Pick<FocusSession, "steps" | "done">): number {
  return s.steps > 0 ? Math.round((s.done / s.steps) * 100) : 0;
}

// -------------------------------------------------------------- budget --

export interface DayBudget {
  /** Seconds allocated in today's queue (still to do), breaks excluded. */
  queuedSeconds: number;
  /** Seconds actually spent in focus runs today, breaks excluded. */
  spentSeconds: number;
  spentBySource: Record<StepSource, number>;
  /** Flexible hours in the day plan, in seconds. */
  flexSeconds: number;
  /** Flexible time neither spent nor queued; negative when over-planned. */
  leftoverSeconds: number;
}

export function dayBudget(
  queue: RoutineStep[],
  spentDay: Record<string, number> | undefined,
  flexHours: number,
): DayBudget {
  const queuedSeconds = (queue ?? [])
    .filter((s) => !s.isBreak)
    .reduce((a, s) => a + clampStep(s.seconds), 0);
  const spentBySource: Record<StepSource, number> = { habit: 0, todo: 0, free: 0 };
  for (const [k, v] of Object.entries(spentDay ?? {})) {
    if (k === "break") continue;
    const src = k.split(":")[0] as StepSource;
    if (src in spentBySource) spentBySource[src] += Number(v) || 0;
  }
  const spentSeconds = spentBySource.habit + spentBySource.todo + spentBySource.free;
  const flexSeconds = Math.round(Math.max(0, Number(flexHours) || 0) * 3600);
  return {
    queuedSeconds,
    spentSeconds,
    spentBySource,
    flexSeconds,
    leftoverSeconds: flexSeconds - queuedSeconds - spentSeconds,
  };
}

/** Minutes of focus a habit got on a day, from the spent map. */
export function habitFocusSeconds(
  spent: Record<string, Record<string, number>> | undefined,
  date: string,
  habitId: string,
): number {
  return Math.max(0, Number(spent?.[date]?.[refKey("habit", habitId)]) || 0);
}

/** 0 to 1 toward a habit's daily time target; 0 when there is no target. */
export function targetProgress(spentSeconds: number, targetMinutes: number | undefined): number {
  const t = Number(targetMinutes) || 0;
  if (t <= 0) return 0;
  return Math.max(0, Math.min(1, spentSeconds / (t * 60)));
}
