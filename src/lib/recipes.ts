import type { FoodItem } from "./types";

/**
 * Meals built from ingredients.
 *
 * A recipe stores its INGREDIENTS, not just the totals it worked out to. Two
 * reasons, both of which show up the first time you edit one: correcting the
 * rice from 200g to 250g should recompute the meal, which is impossible from a
 * frozen total; and a food whose own figures are later corrected should flow
 * through to every meal that uses it.
 *
 * The totals are therefore always derived, never stored.
 */

export interface RecipeIngredient {
  /** Library food name, resolved at compute time so edits flow through. */
  food: string;
  grams: number;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  /** Portions the recipe makes, so a batch cook can be logged per serving. */
  servings: number;
}

/** Every nutrient a FoodItem carries, so nothing is silently dropped. */
const NUTRIENTS = [
  "cals", "p", "c", "f", "fiber",
  "sodium", "potassium", "calcium", "iron", "magnesium", "zinc",
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number];

export type RecipeTotals = Record<NutrientKey, number> & { grams: number };

function emptyTotals(): RecipeTotals {
  const t = { grams: 0 } as RecipeTotals;
  for (const k of NUTRIENTS) t[k] = 0;
  return t;
}

/**
 * What a whole recipe contains, from the current library.
 *
 * An ingredient whose food no longer exists is SKIPPED rather than counted as
 * zero, and reported separately — silently dropping it would understate the
 * meal and give no clue why the numbers moved.
 */
export function recipeTotals(
  recipe: Recipe,
  library: FoodItem[],
): { totals: RecipeTotals; missing: string[] } {
  const byName = new Map(library.map((f) => [f.name.trim().toLowerCase(), f]));
  const totals = emptyTotals();
  const missing: string[] = [];

  for (const ing of recipe.ingredients) {
    const food = byName.get(ing.food.trim().toLowerCase());
    if (!food) {
      missing.push(ing.food);
      continue;
    }
    // Library figures are per `serving` of that food, not per 100g — a whey
    // scoop is recorded per 30g, and assuming 100 would understate it by 3x.
    const per = food.serving || 100;
    const scale = ing.grams / per;
    totals.grams += ing.grams;
    for (const k of NUTRIENTS) totals[k] += (Number(food[k]) || 0) * scale;
  }

  for (const k of NUTRIENTS) totals[k] = Math.round(totals[k] * 10) / 10;
  return { totals, missing };
}

/** One serving of the recipe, which is what actually gets logged. */
export function perServing(recipe: Recipe, library: FoodItem[]): RecipeTotals {
  const { totals } = recipeTotals(recipe, library);
  const n = Math.max(1, recipe.servings || 1);
  const out = { ...totals };
  out.grams = Math.round((totals.grams / n) * 10) / 10;
  for (const k of NUTRIENTS) out[k] = Math.round((totals[k] / n) * 10) / 10;
  return out;
}

/**
 * Turn a recipe into something loggable.
 *
 * Produced as a FoodItem so a meal logs through exactly the same path as any
 * other food — no second code path in the day totals, the day score, or the
 * CSV export, all of which would otherwise need to know about recipes.
 */
export function recipeAsFood(recipe: Recipe, library: FoodItem[], meal = ""): FoodItem {
  const s = perServing(recipe, library);
  return {
    name: recipe.name,
    serving: Math.max(1, Math.round(s.grams)),
    unit: "g",
    cals: s.cals,
    p: s.p,
    c: s.c,
    f: s.f,
    fiber: s.fiber,
    sodium: s.sodium,
    potassium: s.potassium,
    calcium: s.calcium,
    iron: s.iron,
    magnesium: s.magnesium,
    zinc: s.zinc,
    meal,
    isBase: false,
    usageCount: 0,
  } as FoodItem;
}

export const RECIPES_KEY = "soma-recipes";

export function loadRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(RECIPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((r): r is Recipe => !!r && typeof r.name === "string" && Array.isArray(r.ingredients))
      : [];
  } catch {
    return [];
  }
}

export function saveRecipes(recipes: Recipe[]): void {
  try {
    localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
  } catch {
    /* a full store must not lose the meal being built */
  }
}
