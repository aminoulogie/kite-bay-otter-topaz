import assert from "node:assert/strict";
import { test } from "node:test";
import {
  foodWaterMl, suggestWaterPct, totalWaterMl, waterMlFor, waterPctFromMacros,
} from "./hydration.ts";
import type { FoodItem, NutritionDay } from "./types.ts";

const food = (p: Partial<FoodItem>): FoodItem =>
  ({
    name: "x", serving: 100, unit: "g", cals: 0, p: 0, c: 0, f: 0, fiber: 0,
    sodium: 0, potassium: 0, calcium: 0, iron: 0, magnesium: 0, zinc: 0, meal: "",
    ...p,
  }) as FoodItem;

test("water is what is left once the macros are taken out", () => {
  // Whole milk: 3.2 protein, 4.8 carbohydrate, 3.3 fat, ~0.7 minerals.
  assert.equal(waterPctFromMacros({ name: "Whole Milk", p: 3.2, c: 4.8, f: 3.3 }), 88);
  // Orange juice.
  assert.equal(waterPctFromMacros({ name: "Orange Juice", p: 0.7, c: 10.4, f: 0.2 }), 88);
});

test("chocolate milk is not 88% water, and the maths says so", () => {
  // The bug this replaced: a hand-typed table said 86% for anything matching
  // "candia". Its own label is 2.6 / 12.8 / 2.3, which is 82%.
  const pct = suggestWaterPct("Candia choco", { p: 2.6, c: 12.8, f: 2.3 });
  assert.equal(pct, 82);
});

test("a fat or a sugar is no part water", () => {
  assert.equal(waterPctFromMacros({ name: "Olive Oil", p: 0, c: 0, f: 100 }), 0);
  assert.equal(waterPctFromMacros({ name: "Sugar", p: 0, c: 100, f: 0 }), 0);
});

test("solid food is genuinely wet but must not credit the water target", () => {
  // Raw chicken really is about 74% water. Counting that towards a hydration
  // goal would be nonsense, so the suggestion is 0 for anything not a drink
  // even though the underlying figure is right.
  assert.equal(waterPctFromMacros({ name: "Chicken Breast", p: 22.5, c: 0, f: 2.6 }), 74);
  assert.equal(suggestWaterPct("Chicken Breast (Raw)", { p: 22.5, c: 0, f: 2.6 }), 0);
});

test("things with no macros are told apart by name, not assumed", () => {
  // Both are "0g of everything"; only one of them is water.
  assert.equal(suggestWaterPct("Ifri Eau minerale", { p: 0, c: 0, f: 0 }), 100);
  assert.equal(suggestWaterPct("Creatine Monohydrate", { p: 0, c: 0, f: 0 }), 0);
  assert.equal(waterPctFromMacros({ name: "Water", p: 0, c: 0, f: 0 }), null);
});

test("coffee and tea are nearly water, not entirely", () => {
  assert.equal(suggestWaterPct("Coffee (Black)", { p: 0.1, c: 0, f: 0 }), 99);
});

test("millilitres scale with the portion", () => {
  assert.equal(waterMlFor(1000, 88), 880);
  assert.equal(waterMlFor(330, 82), 271);
  assert.equal(waterMlFor(0, 88), 0);
  assert.equal(waterMlFor(500, 0), 0);
  assert.equal(waterMlFor(500, undefined), 0);
});

test("the day's water is what was drunk plus what came in food", () => {
  const day = {
    goals: {}, water: 1500,
    items: [food({ waterMl: 880 }), food({ waterMl: 271 }), food({})],
  } as unknown as NutritionDay;
  assert.equal(foodWaterMl(day), 1151);
  assert.equal(totalWaterMl(day), 2651);
});

test("a day with nothing logged is zero, not a crash", () => {
  assert.equal(totalWaterMl(undefined), 0);
  assert.equal(foodWaterMl(undefined), 0);
});
