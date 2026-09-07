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
 * Water content, worked out from the composition rather than guessed.
 *
 * The first version of this was a table of hand-typed percentages keyed off the
 * product name, and it was wrong in exactly the way a table of guesses is
 * always wrong: chocolate milk was listed at 86% when its own label says
 * otherwise. Candia Choco is 2.6g protein, 12.8g carbohydrate and 2.3g fat per
 * 100 ml — that is 17.7g of dry matter, plus roughly 0.7g of minerals, so the
 * water is about 82%, not 86%.
 *
 * Everything that is not protein, carbohydrate, fat, fibre or ash IS water. So
 * the figure is derived from the macros the food already carries, which means
 * it is right for whatever the food actually is and it corrects itself the
 * moment you fix a label. Checked against known values: whole milk lands on
 * 88%, orange juice on 88%, olive oil on 0%, sugar on 0%, white flour on 12%.
 *
 * ASH is the mineral fraction — the part left after everything else burns off.
 * It is small and fairly consistent, so a single figure per family is close
 * enough at the resolution this feeds (millilitres of water in a glass).
 */

/** Mineral content, g per 100g, by how the food behaves. */
const ASH = {
  dairy: 0.7,
  juice: 0.4,
  soda: 0.1,
  plain: 0.1,
  other: 0.8,
} as const;

function ashFor(name: string): number {
  const n = (name || "").toLowerCase();
  if (/milk|lait|yog|yaourt|raib|lben|candia|soummam|kefir|ayran/.test(n)) return ASH.dairy;
  if (/juice|jus|nectar|rouiba|ifruit|smoothie/.test(n)) return ASH.juice;
  if (/soda|cola|limonade|energy|tonic/.test(n)) return ASH.soda;
  if (/^water|eau$|ifri|sparkling|mineral/.test(n)) return ASH.plain;
  return ASH.other;
}

export interface Macros {
  name?: string;
  p?: number;
  c?: number;
  f?: number;
  fiber?: number;
}

/**
 * Water as a percentage of weight, from the macros.
 *
 * Fibre is part of the carbohydrate figure on most labels, so it is not
 * subtracted twice. Returns null when the food carries no macros at all —
 * a supplement powder and a bottle of water both read as "0g of everything",
 * and only one of them is water, so that case is answered by name below.
 */
export function waterPctFromMacros(food: Macros): number | null {
  const p = Number(food.p) || 0;
  const c = Number(food.c) || 0;
  const f = Number(food.f) || 0;
  if (p === 0 && c === 0 && f === 0) return null;
  const dry = p + c + f + ashFor(food.name ?? "");
  return Math.max(0, Math.min(100, Math.round(100 - dry)));
}

/** Foods that are essentially water and say nothing about it in their macros. */
const PLAIN_WATER = /\bwater\b|^eau|eau minerale|sparkling|mineral water|ifri|\btea\b|the vert|green tea|black tea|coffee|cafe|espresso|infusion|tisane|ماء/i;
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
/**
 * The water percentage to offer for a food.
 *
 * Computed from its own macros where it has any, so it is right for the
 * specific product rather than for a category — which is what the old
 * name-keyed table got wrong. Anything that is not a drink starts at 0: an
 * invented figure that quietly fills a third of the water target is worse than
 * no figure at all, and the field is one tap away.
 */
export function suggestWaterPct(name: string, macros?: Macros): number {
  if (macros) {
    const derived = waterPctFromMacros({ ...macros, name });
    if (derived != null) return looksLikeDrink(name, derived) ? derived : 0;
  }
  // Nothing to compute from: only the things that really are water say so.
  if (!PLAIN_WATER.test(name || "")) return 0;
  return /coffee|cafe|espresso|\btea\b|the vert|infusion|tisane/i.test(name) ? 99 : 100;
}

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
