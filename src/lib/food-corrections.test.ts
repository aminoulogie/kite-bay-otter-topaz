import assert from "node:assert/strict";
import { test } from "node:test";
import { correctCustomFoods } from "./food-corrections.ts";
import type { FoodItem } from "./types.ts";

const food = (o: Partial<FoodItem>) => ({ serving: 100, unit: "g", cals: 0, p: 0, c: 0, f: 0, fiber: 0, ...o }) as FoodItem;

test("a figure that contradicts the food's own macros is put right", () => {
  const [juice] = correctCustomFoods([food({ name: "Rouiba carote", unit: "ml", cals: 184, c: 11 })]);
  assert.equal(juice!.cals, 45);
  assert.ok((juice!.potassium ?? 0) > 0, "and it gains micronutrients");
});

test("a food you have already fixed yourself is left as you set it", () => {
  const mine = food({ name: "Rouiba carote", unit: "ml", cals: 48, c: 11, potassium: 99 });
  const [out] = correctCustomFoods([mine]);
  assert.equal(out!.cals, 48);
  assert.equal(out!.potassium, 99);
});

test("nothing to correct returns the same array", () => {
  const list = [food({ name: "Something else" })];
  assert.equal(correctCustomFoods(list), list);
});
