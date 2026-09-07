/**
 * Water that arrives as food.
 *
 * A litre of orange juice is about 880 ml of water, and until now drinking one
 * counted for nothing against the day's water target — the diary knew the
 * calories and ignored the hydration, so the only way to record both was to log
 * the juice and then tap "+250 ml" four times and hope.
 *
 * Two rules keep this honest:
 *
 *   - the water lives on the LOGGED ITEM, not on the day. Editing a portion or
 *     deleting an item takes its water with it; adding it to `day.water`
 *     instead would strand millilitres nobody could find or remove.
 *   - `day.water` stays exactly what it always was: water the user drank as
 *     water. The total shown is the sum of the two, so the manual buttons and
 *     the food log never fight over the same number.
 */

import type { FoodItem, NutritionDay } from "./types.ts";

/**
 * Typical water content by percentage of weight, for foods where it is worth
 * defaulting. Everything else starts at nothing rather than at a guess: an
 * invented figure that silently fills a third of the water target is worse
 * than no figure at all.
 *
 * Figures are the usual food-composition-table values, rounded — they vary by
 * brand, which is exactly why the field is editable per food.
 */
export const WATER_PCT_HINTS: { match: RegExp; pct: number; label: string }[] = [
  { match: /\bwater\b|eau|ماء/, pct: 100, label: "Water" },
  { match: /\btea\b|coffee|café|infusion/, pct: 99, label: "Tea / coffee" },
  { match: /broth|bouillon|soup|soupe|chorba/, pct: 92, label: "Soup / broth" },
  { match: /juice|jus|nectar|rouiba|orange|citron/, pct: 88, label: "Juice" },
  { match: /milk|lait|حليب|candia|soummam/, pct: 88, label: "Milk" },
  { match: /smoothie|shake|lassi|yaourt à boire/, pct: 80, label: "Smoothie / shake" },
  { match: /soda|cola|limonade|energy drink/, pct: 89, label: "Soft drink" },
  { match: /yogurt|yoghurt|yaourt|petit suisse|fromage blanc/, pct: 82, label: "Yoghurt" },
];

/** A sensible starting water percentage for a food, or 0 when there is no basis. */
export function suggestWaterPct(name: string): number {
  const n = (name || "").toLowerCase();
  for (const hint of WATER_PCT_HINTS) if (hint.match.test(n)) return hint.pct;
  return 0;
}

/**
 * Whether a food is one you drink, which is what decides the default unit.
 *
 * Deliberately generous: getting this wrong only changes which unit is
 * preselected, and the picker is one tap away either way.
 */
export function looksLikeDrink(name: string, waterPct?: number): boolean {
  if ((waterPct ?? 0) >= 80) return true;
  return /juice|jus|milk|lait|drink|soda|cola|water|eau|tea|coffee|café|shake|smoothie|nectar|حليب|ماء/i.test(
    name || "",
  );
}

/**
 * Millilitres of water in a portion.
 *
 * Grams and millilitres are treated as interchangeable here. They are not, for
 * anything dense — but for a drink, whose density is within a few percent of
 * water's, the error is far smaller than the error in the percentage itself.
 */
export function waterMlFor(grams: number, waterPct?: number): number {
  const pct = Math.max(0, Math.min(100, waterPct ?? 0));
  if (!pct || !(grams > 0)) return 0;
  return Math.round((grams * pct) / 100);
}

/** Water from food, for one day. */
export function foodWaterMl(day: NutritionDay | undefined): number {
  return (day?.items ?? []).reduce((a: number, i: FoodItem) => a + (i.waterMl || 0), 0);
}

/**
 * The day's total water: what was drunk as water, plus what came in food.
 *
 * Every reader of the water figure should go through this rather than reading
 * `day.water`, or the ring and the log disagree.
 */
export function totalWaterMl(day: NutritionDay | undefined): number {
  return Math.round((day?.water || 0) + foodWaterMl(day));
}
