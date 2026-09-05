import assert from "node:assert/strict";
import { test } from "node:test";
import { perServing, recipeAsFood, recipeTotals, type Recipe } from "./recipes.ts";

const library = [
  { name: "White Rice", serving: 100, unit: "g", cals: 130, p: 2.7, c: 28, f: 0.3, fiber: 0.4,
    sodium: 1, potassium: 35, calcium: 10, iron: 0.2, magnesium: 12, zinc: 0.5, meal: "" },
  { name: "Chicken Breast", serving: 100, unit: "g", cals: 165, p: 31, c: 0, f: 3.6, fiber: 0,
    sodium: 74, potassium: 256, calcium: 15, iron: 1, magnesium: 29, zinc: 1, meal: "" },
  // Recorded per 30g, not per 100 — the case that catches a hardcoded /100.
  { name: "Whey", serving: 30, unit: "g", cals: 120, p: 25, c: 1.5, f: 1, fiber: 0,
    sodium: 140, potassium: 160, calcium: 130, iron: 0.4, magnesium: 20, zinc: 0.5, meal: "" },
] as never;

const meal: Recipe = {
  id: "1", name: "Chicken and rice", servings: 2,
  ingredients: [{ food: "White Rice", grams: 200 }, { food: "Chicken Breast", grams: 300 }],
};

test("totals scale each ingredient by its own serving size", () => {
  const { totals } = recipeTotals(meal, library);
  assert.equal(totals.cals, 130 * 2 + 165 * 3);
  assert.equal(Math.round(totals.p), Math.round(2.7 * 2 + 31 * 3));
  assert.equal(totals.grams, 500);
});

test("a food recorded per 30g is not treated as per 100g", () => {
  // Assuming 100 would understate a whey scoop threefold.
  const r: Recipe = { id: "2", name: "Shake", servings: 1, ingredients: [{ food: "Whey", grams: 30 }] };
  assert.equal(recipeTotals(r, library).totals.cals, 120);
});

test("micronutrients are carried, not just macros", () => {
  const { totals } = recipeTotals(meal, library);
  assert.ok(totals.magnesium > 0);
  assert.ok(totals.potassium > 0);
});

test("per serving divides by the number of servings", () => {
  const s = perServing(meal, library);
  const { totals } = recipeTotals(meal, library);
  assert.equal(s.cals, Math.round((totals.cals / 2) * 10) / 10);
});

test("a missing ingredient is reported, never counted as zero", () => {
  // Silently dropping it would understate the meal with no clue why.
  const r: Recipe = {
    id: "3", name: "Broken", servings: 1,
    ingredients: [{ food: "White Rice", grams: 100 }, { food: "Unicorn", grams: 50 }],
  };
  const { totals, missing } = recipeTotals(r, library);
  assert.deepEqual(missing, ["Unicorn"]);
  assert.equal(totals.cals, 130);
});

test("editing an ingredient changes the meal, because totals are derived", () => {
  const more: Recipe = { ...meal, ingredients: [{ food: "White Rice", grams: 400 }, { food: "Chicken Breast", grams: 300 }] };
  assert.ok(recipeTotals(more, library).totals.cals > recipeTotals(meal, library).totals.cals);
});

test("a recipe logs as an ordinary food", () => {
  // So day totals, the day score and the CSV export need no second code path.
  const f = recipeAsFood(meal, library, "Lunch");
  assert.equal(f.meal, "Lunch");
  assert.equal(f.unit, "g");
  assert.ok(f.cals > 0 && f.p > 0);
  assert.equal(f.serving, Math.round(500 / 2));
});
