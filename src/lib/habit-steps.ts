/**
 * Habits that are really a checklist.
 *
 * "Skincare" is not one action. It is face wash, then moisturiser, then SPF,
 * and ticking it off having done only the first is the kind of small lie that
 * makes a tracker worthless — the streak survives, the skin does not. Same for
 * oral health: floss once and brush three times, or it did not happen.
 *
 * So a habit may carry STEPS, and when it does the parent tick stops being
 * something you press. It is derived: the habit is done on a day when every
 * step has met its target that day, and not before.
 *
 * **`history` stays the single source of truth for "was this day done".**
 * The heatmaps, the streak count, the calendar day-marks and the coach's habit
 * rule all read that field and none of them know steps exist. Steps write
 * through to it rather than sitting beside it, because two places recording
 * the same fact is two places to disagree.
 *
 * One rule here is deliberately conservative: adding a step to a habit does NOT
 * un-tick the days already marked done. Those days were completed under the old
 * definition and the tracker has no business rewriting the past to suit a
 * checklist written afterwards. Only days that actually carry step counts are
 * re-derived.
 */

import type { Habit, HabitStep } from "./types";

/** Nobody brushes their teeth thirteen times. A cap keeps the counter sane. */
export const MAX_TARGET = 12;

export function hasSteps(habit: Habit): boolean {
  return (habit.steps?.length ?? 0) > 0;
}

/** How many times a step has been done on a day. */
export function stepCount(habit: Habit, date: string, stepId: string): number {
  const n = habit.stepLog?.[date]?.[stepId];
  return Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : 0;
}

export function targetOf(step: HabitStep): number {
  const t = Math.floor(Number(step.target) || 1);
  return Math.min(MAX_TARGET, Math.max(1, t));
}

export function stepDone(step: HabitStep, count: number): boolean {
  return count >= targetOf(step);
}

export interface StepProgress {
  /** Steps that met their target today. */
  done: number;
  total: number;
  /** Individual repetitions done and required, across every step. */
  reps: number;
  repTarget: number;
  complete: boolean;
}

export function progress(habit: Habit, date: string): StepProgress {
  const steps = habit.steps ?? [];
  let done = 0;
  let reps = 0;
  let repTarget = 0;
  for (const s of steps) {
    const target = targetOf(s);
    const n = Math.min(target, stepCount(habit, date, s.id));
    repTarget += target;
    reps += n;
    if (n >= target) done++;
  }
  return { done, total: steps.length, reps, repTarget, complete: steps.length > 0 && done === steps.length };
}

/**
 * The next count for a step that has just been tapped.
 *
 * Past the target it wraps to zero rather than climbing. A counter with no way
 * back turns one mis-tap into a day you cannot correct, and an extra control to
 * undo it would be a second button on a row that is already small.
 */
export function bump(count: number, target: number): number {
  const t = Math.min(MAX_TARGET, Math.max(1, Math.floor(Number(target) || 1)));
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n + 1 > t ? 0 : n + 1;
}

/** Drop counts for steps that no longer exist, and clear empty days. */
function tidy(log: Record<string, Record<string, number>>, steps: HabitStep[]) {
  const live = new Set(steps.map((s) => s.id));
  const out: Record<string, Record<string, number>> = {};
  for (const [date, day] of Object.entries(log)) {
    const kept: Record<string, number> = {};
    for (const [id, n] of Object.entries(day)) {
      if (live.has(id) && n > 0) kept[id] = n;
    }
    if (Object.keys(kept).length) out[date] = kept;
  }
  return out;
}

/**
 * Re-derive `history` for one day from that day's step counts.
 *
 * A stepless habit is returned untouched — its history is whatever the user
 * pressed, which is the whole behaviour for a habit that is a single action.
 */
export function syncDay(habit: Habit, date: string): Habit {
  if (!hasSteps(habit)) return habit;
  const complete = progress(habit, date).complete;
  if (!!habit.history[date] === complete) return habit;
  return { ...habit, history: { ...habit.history, [date]: complete } };
}

/** Set one step's count for a day, and let the habit's tick follow from it. */
export function setStep(habit: Habit, date: string, stepId: string, count: number): Habit {
  const step = (habit.steps ?? []).find((s) => s.id === stepId);
  if (!step) return habit;
  const n = Math.min(targetOf(step), Math.max(0, Math.floor(Number(count) || 0)));

  const log = { ...(habit.stepLog ?? {}) };
  const day = { ...(log[date] ?? {}) };
  if (n > 0) day[stepId] = n;
  else delete day[stepId];
  if (Object.keys(day).length) log[date] = day;
  else delete log[date];

  return syncDay({ ...habit, stepLog: log }, date);
}

/** Tap one step: one more repetition, or back to none once it is over. */
export function bumpStep(habit: Habit, date: string, stepId: string): Habit {
  const step = (habit.steps ?? []).find((s) => s.id === stepId);
  if (!step) return habit;
  return setStep(habit, date, stepId, bump(stepCount(habit, date, stepId), targetOf(step)));
}

/** Everything done, or nothing — what the parent row's tick means now. */
export function setAll(habit: Habit, date: string, done: boolean): Habit {
  if (!hasSteps(habit)) {
    return { ...habit, history: { ...habit.history, [date]: done } };
  }
  const log = { ...(habit.stepLog ?? {}) };
  if (done) {
    const day: Record<string, number> = {};
    for (const s of habit.steps!) day[s.id] = targetOf(s);
    log[date] = day;
  } else {
    delete log[date];
  }
  return syncDay({ ...habit, stepLog: log }, date);
}

/**
 * Replace a habit's step list.
 *
 * Every day that carries step counts is re-derived, because editing the list
 * changes what "done" meant on those days — deleting the one step you had not
 * got to completes them, and adding a step un-completes them. Days with no
 * counts are left exactly as they are: see the note at the top of this file.
 */
export function setSteps(habit: Habit, steps: HabitStep[]): Habit {
  const clean = (steps ?? [])
    .map((s) => ({ ...s, name: s.name.trim(), target: targetOf(s) }))
    .filter((s) => s.name.length > 0);

  const log = tidy(habit.stepLog ?? {}, clean);
  let next: Habit = { ...habit, steps: clean, stepLog: log };

  if (clean.length === 0) {
    // Back to a plain habit. The counts are gone, but the day-marks earned
    // under the checklist stay: they were real.
    const { stepLog: _drop, ...rest } = next;
    return { ...rest, steps: [] };
  }

  for (const date of Object.keys(log)) next = syncDay(next, date);
  return next;
}

let seq = 0;
export function newStepId(): string {
  seq += 1;
  return `hs-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/** "3×" for a step done three times a day, and nothing at all for once. */
export function targetLabel(step: HabitStep): string {
  const t = targetOf(step);
  return t > 1 ? `${t}×` : "";
}

/**
 * Two checklists worth shipping ready-made, because they are the two everybody
 * writes out by hand and both are exactly the case steps exist for.
 */
export const STEP_PRESETS: { name: string; desc: string; color: string; steps: { name: string; target: number }[] }[] = [
  {
    name: "Skincare",
    desc: "The whole routine, not the first step of it",
    color: "#3fb6f0",
    steps: [
      { name: "Face wash", target: 2 },
      { name: "Moisturiser", target: 2 },
      { name: "SPF", target: 1 },
    ],
  },
  {
    name: "Oral health",
    desc: "Brush three times, floss once",
    color: "#35c9a8",
    steps: [
      { name: "Brush", target: 3 },
      { name: "Floss", target: 1 },
      { name: "Tongue scrape", target: 1 },
    ],
  },
];
