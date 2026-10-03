import type { Habit } from "./types.ts";

/** A new habit takes the first of these not already in use, so a list is not all one colour. */
export const HABIT_COLORS = ["#ff9f0a", "#30d158", "#64d2ff", "#bf5af2", "#ff375f", "#ffd60a", "#5e5ce6", "#d3fd50"];

export function nextHabitColor(habits: Habit[]): string {
  const used = new Set(habits.map((h) => h.color.toLowerCase()));
  return HABIT_COLORS.find((c) => !used.has(c)) ?? HABIT_COLORS[habits.length % HABIT_COLORS.length]!;
}
