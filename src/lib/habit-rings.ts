/**
 * A habit's day, as one number between 0 and 1.
 *
 * Home needs to show every habit at a glance, and a glance has room for a
 * shape rather than a row of controls. So each habit becomes a ring: empty,
 * part-filled, or closed.
 *
 * The three shapes a habit can take all reduce to the same fraction, and the
 * reduction is the only interesting part:
 *
 * **A checklist** is its repetitions, not its steps. Brushing twice of three
 * is two thirds of the way through the day, and counting completed STEPS
 * instead would show nothing at all until a step finished — so a habit with
 * one three-times-a-day step would sit at zero all day and then jump to full.
 *
 * **A ramp** is binary. "Read 14 minutes today" is met or it is not; drawing
 * 9/14 of a ring would say partial credit exists, and the whole point of a
 * ramp is that today's rung is the bar.
 *
 * **Everything else** is the tick.
 *
 * `history[date]` stays the authority on DONE — this only decides how much of
 * the ring is drawn on the way there.
 */

import { progress as stepProgress, hasSteps } from "./habit-steps.ts";
import { status as rampStatus } from "./habit-ramp.ts";
import type { Habit } from "./types.ts";

export interface HabitRing {
  id: string;
  name: string;
  color: string;
  /** 0 to 1. */
  fill: number;
  done: boolean;
  /** What the ring is counting, for the label under it. */
  detail: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function ringFor(habit: Habit, date: string): HabitRing {
  const done = habit?.history?.[date] === true;
  const base = {
    id: habit?.id ?? "",
    name: habit?.name ?? "",
    color: habit?.color || "var(--color-accent)",
  };

  if (hasSteps(habit)) {
    const p = stepProgress(habit, date);
    return {
      ...base,
      // Repetitions, not steps: see the note above.
      fill: p.repTarget > 0 ? clamp01(p.reps / p.repTarget) : 0,
      done: p.complete,
      detail: `${p.reps}/${p.repTarget}`,
    };
  }

  if (habit?.ramp) {
    const s = rampStatus(habit.ramp, date, habit.amountLog);
    return {
      ...base,
      fill: s.done ? 1 : 0,
      done: s.done,
      detail: s.done ? "met" : "today's rung",
    };
  }

  return { ...base, fill: done ? 1 : 0, done, detail: done ? "done" : "not yet" };
}

export function ringsFor(habits: Habit[], date: string): HabitRing[] {
  return (habits ?? []).filter((h) => h && h.id).map((h) => ringFor(h, date));
}

/** How many are closed, out of how many there are. */
export function tally(rings: HabitRing[]): { done: number; total: number } {
  const list = rings ?? [];
  return { done: list.filter((r) => r.done).length, total: list.length };
}

/** The circumference offset for a ring drawn with this radius. */
export function dashFor(fill: number, radius: number): { length: number; offset: number } {
  const c = 2 * Math.PI * Math.max(0, Number(radius) || 0);
  return { length: c, offset: c * (1 - clamp01(fill)) };
}
