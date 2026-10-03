import type { Habit } from "./types.ts";

/** A new habit takes the first of these not already in use, so a list is not all one colour. */
export const HABIT_COLORS = ["#ff9f0a", "#30d158", "#64d2ff", "#bf5af2", "#ff375f", "#ffd60a", "#5e5ce6", "#d3fd50"];

export function nextHabitColor(habits: Habit[]): string {
  const used = new Set(habits.map((h) => h.color.toLowerCase()));
  return HABIT_COLORS.find((c) => !used.has(c)) ?? HABIT_COLORS[habits.length % HABIT_COLORS.length]!;
}

export type HabitCategory = "Health" | "Mind" | "Productivity" | "Other";

const CATEGORY_RULES: [RegExp, HabitCategory][] = [
  [/read|book|page|meditat|mindful|breath|pray|journal|write|learn|language|gratitude|think/i, "Mind"],
  [/code|work|deep|focus|study|screen|phone|social|plan|email|inbox|money|budget|spend|save|project/i, "Productivity"],
  [/water|hydrat|gym|train|lift|workout|run|walk|step|sleep|bed|protein|creatine|vitamin|eat|food|veg|stretch|yoga|mobility|push|pull|squat|cardio|skin|teeth|floss/i, "Health"],
];

/** A category guessed from the name, for the filter chips. */
export function habitCategory(name: string): HabitCategory {
  return CATEGORY_RULES.find(([re]) => re.test(name))?.[1] ?? "Other";
}
