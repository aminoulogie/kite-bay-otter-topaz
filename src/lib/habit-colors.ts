import type { Habit } from "./types.ts";

/** A new habit takes the first of these not already in use, so a list is not all one colour. */
export const HABIT_COLORS = [
  "#34e0a1", "#4c8dff", "#ffcf4a", "#a77bff", "#ff5c8a", "#3dd6f5",
  "#ff9e3d", "#6e6bff", "#e879f9", "#ff6b57", "#d3fd50",
];

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

/** Remember a colour someone picked by hand, newest first, at most eight. */
export function pushRecentColor(list: string[] | undefined, color: string): string[] {
  const c = color.toLowerCase();
  return [c, ...(list ?? []).filter((x) => x.toLowerCase() !== c)].slice(0, 8);
}

export function toggleFavoriteColor(list: string[] | undefined, color: string): string[] {
  const c = color.toLowerCase();
  const cur = list ?? [];
  return cur.some((x) => x.toLowerCase() === c) ? cur.filter((x) => x.toLowerCase() !== c) : [c, ...cur].slice(0, 12);
}
