/**
 * A day's food, built out of what is actually in the house.
 *
 * The question this answers is the one you have at 7am with the fridge open:
 * given what I have and what I am aiming at, what should today look like? Not
 * a recipe and not a meal plan bought off a website — a list of portions of
 * food that is already in the cupboard, hitting the targets you already set.
 *
 * What it will not do:
 *
 *  - **Propose food you do not have.** Every line comes from stock. A plan
 *    that opens with 200g of salmon you would have to go and buy is a
 *    shopping list pretending to be breakfast.
 *  - **Invent a macro.** A stocked item only becomes a candidate if it matches
 *    a food in the library with real figures on it. Stock with no nutrition
 *    behind it is skipped and reported, not guessed at.
 *  - **Fill the day with one thing.** A greedy fit left to itself will
 *    happily prescribe 900g of chicken; portions are capped and each food is
 *    used once.
 */

import { perGram, type Macro, type Totals } from "./rebalance.ts";
import { stockKey, type PantryItem } from "./pantry.ts";
import type { FoodItem, Goals } from "./types.ts";

/** Nobody eats 900g of one thing because a spreadsheet said so. */
export const MAX_PORTION_G = 350;

/** A portion smaller than this is not worth putting on the plan. */
export const MIN_PORTION_G = 25;

/** How many foods a suggested day may contain. */
export const MAX_LINES = 6;

/** Below this improvement in total miss, another line is padding. */
export const MIN_GAIN = 0.03;

export interface Suggestion {
  /** Ready to hand straight to planFood. */
  items: FoodItem[];
  /** Where the day lands if the whole thing is eaten. */
  projected: Totals;
  /** Stocked foods with no nutrition data behind them, named rather than guessed. */
  skipped: string[];
  /** One line for the card. Always present. */
  note: string;
}

const round5 = (g: number) => Math.round(g / 5) * 5;

/** Which stocked items we know the nutrition of. */
function candidates(
  pantry: PantryItem[],
  library: FoodItem[],
): { stock: PantryItem; food: FoodItem; pg: Totals }[] {
  const byName = new Map(library.map((f) => [stockKey(f.name), f]));
  const out: { stock: PantryItem; food: FoodItem; pg: Totals }[] = [];
  for (const stock of pantry ?? []) {
    if ((Number(stock.qty) || 0) <= 0) continue;
    // Pieces cannot be portioned in grams, which is how every target here is
    // expressed. Skipped rather than converted by a guess.
    if (stock.unit !== "g" && stock.unit !== "ml") continue;
    const food = byName.get(stockKey(stock.name));
    if (!food) continue;
    const pg = perGram(food);
    if (!pg) continue;
    out.push({ stock, food, pg });
  }
  return out;
}

export function suggestDay(
  pantry: PantryItem[],
  library: FoodItem[],
  goals: Goals,
  eaten: FoodItem[] = [],
  meal = "Lunch",
): Suggestion {
  const targets: Record<Macro, number> = {
    p: Number(goals?.protein) || 0,
    c: Number(goals?.carbs) || 0,
    f: Number(goals?.fat) || 0,
  };

  const start: Totals = (eaten ?? []).reduce<Totals>(
    (a, i) => ({
      cals: a.cals + (Number(i.cals) || 0),
      p: a.p + (Number(i.p) || 0),
      c: a.c + (Number(i.c) || 0),
      f: a.f + (Number(i.f) || 0),
    }),
    { cals: 0, p: 0, c: 0, f: 0 },
  );

  const pool = candidates(pantry, library);
  const known = new Set(pool.map((c) => stockKey(c.stock.name)));
  const skipped = (pantry ?? [])
    .filter((p) => (Number(p.qty) || 0) > 0 && !known.has(stockKey(p.name)))
    .map((p) => p.name);

  const miss = (t: Totals) => {
    let score = 0;
    for (const m of ["p", "c", "f"] as Macro[]) {
      if (targets[m] <= 0) continue;
      score += Math.abs(t[m] - targets[m]) / targets[m];
    }
    return score;
  };

  if (!pool.length || !(targets.p || targets.c || targets.f)) {
    return {
      items: [],
      projected: start,
      skipped,
      note: !pool.length
        ? "Nothing in the cupboard has nutrition behind it yet — track a few foods by the same name they have in the diary."
        : "Set your daily targets first and this can aim at something.",
    };
  }

  const items: FoodItem[] = [];
  const used = new Set<string>();
  let now = { ...start };

  for (let round = 0; round < MAX_LINES; round++) {
    let best: { item: FoodItem; after: Totals; gain: number } | null = null;
    const before = miss(now);

    for (const c of pool) {
      const key = stockKey(c.stock.name);
      // Once each. A greedy fit left alone will prescribe the same food four
      // times because it is arithmetically the best answer every round.
      if (used.has(key)) continue;

      // Size it to whichever gap it can best serve, then clamp to what is
      // actually in the cupboard and to a portion a person would eat.
      for (const m of ["p", "c", "f"] as Macro[]) {
        const gap = targets[m] - now[m];
        if (gap <= 0 || c.pg[m] <= 0) continue;
        const grams = round5(
          Math.min(gap / c.pg[m], Number(c.stock.qty) || 0, MAX_PORTION_G),
        );
        if (grams < MIN_PORTION_G) continue;

        const after: Totals = {
          cals: now.cals + c.pg.cals * grams,
          p: now.p + c.pg.p * grams,
          c: now.c + c.pg.c * grams,
          f: now.f + c.pg.f * grams,
        };
        const gain = before - miss(after);
        if (gain > (best?.gain ?? MIN_GAIN)) {
          best = {
            after,
            gain,
            item: {
              ...c.food,
              serving: grams,
              unit: c.stock.unit,
              meal,
              cals: Math.round(c.pg.cals * grams),
              p: Math.round(c.pg.p * grams * 10) / 10,
              c: Math.round(c.pg.c * grams * 10) / 10,
              f: Math.round(c.pg.f * grams * 10) / 10,
            },
          };
        }
      }
    }

    if (!best) break;
    items.push(best.item);
    used.add(stockKey(best.item.name));
    now = best.after;
  }

  const note = items.length
    ? `${items.length} thing${items.length === 1 ? "" : "s"} from the cupboard: ${Math.round(now.p)}g protein, ${Math.round(now.c)}g carbs, ${Math.round(now.f)}g fat.`
    : "Nothing in stock gets you closer to today's targets than what you have already eaten.";

  return { items, projected: now, skipped, note };
}
