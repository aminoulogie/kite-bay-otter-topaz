/**
 * The foods you actually eat, and the meals you actually repeat.
 *
 * Search ranks on `usageCount`, and nothing has ever incremented it — every
 * food in the library sits at zero, so the tie-break that was meant to float
 * your staples has never done anything. Rather than start counting from today
 * and be useful in a month, this derives the same thing from the nutrition log
 * that is already there, which makes it right immediately and retroactively.
 *
 * Recency and frequency both matter and neither alone is enough. Frequency
 * alone keeps offering the oatmeal you gave up in July; recency alone puts
 * yesterday's one-off restaurant plate above the eggs you have every morning.
 */

import type { FoodItem, NutritionDay } from "./types.ts";

/** Days back to consider. Beyond this a food is history, not a habit. */
const WINDOW_DAYS = 45;
/** Half-life for recency, in days: a food eaten 14 days ago counts half. */
const HALF_LIFE = 14;

export interface RecentFood {
  name: string;
  /** Times logged inside the window. */
  count: number;
  /** Most recent date it was logged. */
  last: string;
  /** Recency-weighted frequency, for ordering. */
  score: number;
  /** The last version logged, so a portion can be repeated exactly. */
  item: FoodItem;
}

function daysBetween(a: string, b: string): number {
  const x = Date.parse(`${a}T12:00:00`);
  const y = Date.parse(`${b}T12:00:00`);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Number.POSITIVE_INFINITY;
  return Math.abs(y - x) / 86_400_000;
}

/**
 * Foods logged recently, most worth offering first.
 *
 * Each logging contributes 2^(-age/half-life), so ten breakfasts over two
 * weeks beat one big dinner yesterday, and a food abandoned a month ago falls
 * away without being deleted.
 */
export function recentFoods(
  nutrition: Record<string, NutritionDay>,
  today: string,
  limit = 12,
): RecentFood[] {
  const by = new Map<string, RecentFood>();

  for (const [date, day] of Object.entries(nutrition)) {
    // A day logged in the future is a typo, not a meal.
    if (date > today) continue;
    const age = daysBetween(date, today);
    if (age > WINDOW_DAYS) continue;
    const weight = Math.pow(2, -age / HALF_LIFE);

    for (const item of day?.items ?? []) {
      const key = item.name.trim().toLowerCase();
      if (!key) continue;
      const found = by.get(key);
      if (!found) {
        by.set(key, { name: item.name, count: 1, last: date, score: weight, item });
        continue;
      }
      found.count += 1;
      found.score += weight;
      // Keep the most recent version: portions drift, and the one you logged
      // last is the one you are most likely to log again.
      if (date >= found.last) {
        found.last = date;
        found.item = item;
      }
    }
  }

  return [...by.values()].sort((a, b) => b.score - a.score || b.last.localeCompare(a.last)).slice(0, limit);
}

/**
 * The last day before `before` that had anything logged under `meal`.
 *
 * Returns the date rather than the items so the caller can name it — "repeat
 * Monday's breakfast" is a different offer from "repeat a breakfast".
 */
export function lastMealDate(
  nutrition: Record<string, NutritionDay>,
  meal: string,
  before: string,
): string | null {
  let best: string | null = null;
  for (const [date, day] of Object.entries(nutrition)) {
    if (date >= before) continue;
    if (!(day?.items ?? []).some((i) => i.meal === meal)) continue;
    if (!best || date > best) best = date;
  }
  return best;
}

/** The items logged under one meal on one day. */
export function mealItems(
  nutrition: Record<string, NutritionDay>,
  date: string,
  meal: string,
): FoodItem[] {
  return (nutrition[date]?.items ?? []).filter((i) => i.meal === meal);
}
