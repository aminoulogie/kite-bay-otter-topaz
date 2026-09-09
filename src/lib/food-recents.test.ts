import assert from "node:assert/strict";
import { test } from "node:test";
import { lastMealDate, mealItems, recentFoods } from "./food-recents.ts";
import type { FoodItem, NutritionDay } from "./types.ts";

const food = (name: string, meal = "Breakfast"): FoodItem =>
  ({ name, serving: 100, unit: "g", cals: 100, p: 5, c: 10, f: 2, fiber: 0, meal }) as FoodItem;

const day = (...items: FoodItem[]): NutritionDay =>
  ({ goals: {}, water: 0, items }) as unknown as NutritionDay;

test("a staple eaten often beats a one-off eaten yesterday", () => {
  // Frequency alone would be wrong too — this is the case that decides the
  // whole ranking, so it is the first thing pinned.
  const n: Record<string, NutritionDay> = { "2026-09-08": day(food("Restaurant Plate")) };
  for (const d of ["2026-09-01","2026-09-02","2026-09-03","2026-09-04","2026-09-05","2026-09-06"]) {
    n[d] = day(food("Whole Eggs"));
  }
  const out = recentFoods(n, "2026-09-09");
  assert.equal(out[0]?.name, "Whole Eggs");
  assert.equal(out[0]?.count, 6);
});

test("a food given up a month ago falls away without being deleted", () => {
  const n: Record<string, NutritionDay> = {};
  // Eaten every day in July, then never again.
  for (let d = 1; d <= 20; d++) n[`2026-07-${String(d).padStart(2, "0")}`] = day(food("Oatmeal"));
  n["2026-09-08"] = day(food("Banana"));
  const out = recentFoods(n, "2026-09-09");
  assert.equal(out[0]?.name, "Banana");
  assert.ok(!out.some((f) => f.name === "Oatmeal"), "beyond the window entirely");
});

test("the most recently logged version is the one offered back", () => {
  // Portions drift; the one you logged last is the one you will log again.
  const n = {
    "2026-09-01": day({ ...food("Rice"), serving: 100 } as FoodItem),
    "2026-09-07": day({ ...food("Rice"), serving: 250 } as FoodItem),
  };
  assert.equal(recentFoods(n, "2026-09-09")[0]?.item.serving, 250);
});

test("a day logged in the future is a typo, not a meal", () => {
  const n = { "2026-12-25": day(food("Christmas Cake")), "2026-09-08": day(food("Eggs")) };
  const out = recentFoods(n, "2026-09-09");
  assert.deepEqual(out.map((f) => f.name), ["Eggs"]);
});

test("the same food logged twice in a day counts twice", () => {
  const n = { "2026-09-08": day(food("Eggs"), food("Eggs", "Dinner")) };
  assert.equal(recentFoods(n, "2026-09-09")[0]?.count, 2);
});

test("names are matched case-insensitively but shown as logged", () => {
  const n = { "2026-09-07": day(food("whole eggs")), "2026-09-08": day(food("Whole Eggs")) };
  const out = recentFoods(n, "2026-09-09");
  assert.equal(out.length, 1);
  assert.equal(out[0]?.name, "whole eggs", "the first spelling seen names the group");
  assert.equal(out[0]?.count, 2);
});

test("nothing logged is an empty list, not a crash", () => {
  assert.deepEqual(recentFoods({}, "2026-09-09"), []);
});

test("the last day you ate that meal is found, and today is not it", () => {
  const n = {
    "2026-09-05": day(food("Eggs", "Breakfast")),
    "2026-09-07": day(food("Oats", "Breakfast")),
    "2026-09-09": day(food("Toast", "Breakfast")),
  };
  assert.equal(lastMealDate(n, "Breakfast", "2026-09-09"), "2026-09-07");
  assert.equal(lastMealDate(n, "Dinner", "2026-09-09"), null);
});

test("only that meal's items come back", () => {
  const n = { "2026-09-07": day(food("Oats", "Breakfast"), food("Rice", "Dinner")) };
  assert.deepEqual(mealItems(n, "2026-09-07", "Dinner").map((i) => i.name), ["Rice"]);
  assert.deepEqual(mealItems(n, "2026-09-06", "Dinner"), []);
});
