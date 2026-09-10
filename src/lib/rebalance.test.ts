import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MACRO_NAME, MIN_CUT_G, OVER_TOLERANCE, perGram, rebalance, totalsOf,
} from "./rebalance.ts";
import type { FoodItem, Goals } from "./types.ts";

const food = (over: Partial<FoodItem> & { name: string }): FoodItem =>
  ({
    serving: 100, unit: "g", cals: 0, p: 0, c: 0, f: 0,
    fiber: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, magnesium: 0, zinc: 0,
    ...over,
  }) as FoodItem;

const GOALS: Goals = { cals: 3000, protein: 180, carbs: 350, fat: 80 } as Goals;

// 100g of peanuts: dense in fat, real protein, few carbs.
const PEANUTS = food({ name: "Peanuts", cals: 567, p: 26, c: 16, f: 49 });
const RICE = food({ name: "White rice", serving: 100, cals: 130, p: 2.7, c: 28, f: 0.3 });
const CHICKEN = food({ name: "Chicken breast", cals: 165, p: 31, c: 0, f: 3.6 });

test("nothing planned says so rather than inventing advice", () => {
  const r = rebalance([], [], GOALS, [CHICKEN]);
  assert.equal(r.over, null);
  assert.match(r.note, /Nothing planned/);
});

test("a plan inside target is left alone", () => {
  const r = rebalance([], [food({ name: "Rice", cals: 300, p: 6, c: 65, f: 1 })], GOALS, [CHICKEN]);
  assert.equal(r.over, null);
  assert.equal(r.cut, null);
  assert.match(r.note, /inside your targets/);
});

test("a few grams over is rounding, not a problem", () => {
  // 83g of fat against a target of 80. Firing here would train the user to
  // ignore the card.
  const r = rebalance([], [food({ name: "Nuts", cals: 700, p: 10, c: 5, f: 83 })], GOALS, []);
  assert.equal(r.over, null);
  assert.ok(OVER_TOLERANCE > 0);
});

test("it names the macro, the item and the grams", () => {
  const plan = [food({ ...PEANUTS, serving: 200, cals: 1134, p: 52, c: 32, f: 98 })];
  const r = rebalance([], plan, GOALS, [RICE, CHICKEN]);
  assert.equal(r.over, "f");
  assert.equal(r.cut?.name, "Peanuts");
  assert.ok(r.cut!.grams >= MIN_CUT_G);
  assert.match(r.note, /over on fat/);
  assert.match(r.note, /Cut Peanuts by \d+g/);
});

test("the cut is never bigger than the portion", () => {
  // 30g of peanuts cannot absorb a 40g fat overshoot, and telling someone to
  // remove 80g of a 30g portion is nonsense.
  const plan = [
    food({ name: "Peanuts", serving: 30, cals: 170, p: 8, c: 5, f: 15 }),
    food({ name: "Oil", serving: 100, cals: 884, p: 0, c: 0, f: 100 }),
  ];
  const r = rebalance([], plan, GOALS, []);
  assert.ok(r.cut);
  const portion = plan.find((i) => i.name === r.cut!.name)!;
  assert.ok(r.cut!.grams <= portion.serving);
});

test("it says what the cut costs you", () => {
  const plan = [food({ ...PEANUTS, serving: 200, cals: 1134, p: 52, c: 32, f: 98 })];
  const r = rebalance([], plan, GOALS, [CHICKEN]);
  // Cutting peanuts removes protein too, and hiding that is how you end up
  // under on the macro you actually care about.
  assert.ok(r.cut!.costs.p > 0);
  assert.ok(r.cut!.costs.f > 0);
  assert.ok(r.cut!.costs.cals > 0);
});

test("what it proposes adding must fix the gap without putting the fat back", () => {
  const plan = [food({ ...PEANUTS, serving: 300, cals: 1701, p: 78, c: 48, f: 147 })];
  const r = rebalance([], plan, GOALS, [RICE, PEANUTS, CHICKEN]);
  assert.ok(r.add, "protein and carbs are both short after that cut");
  assert.notEqual(r.add!.name, "Peanuts", "never the thing it just told you to cut");
});

test("it only ever proposes food that exists", () => {
  const plan = [food({ ...PEANUTS, serving: 300, cals: 1701, p: 78, c: 48, f: 147 })];
  const empty = rebalance([], plan, GOALS, []);
  assert.equal(empty.add, null, "an empty library proposes nothing, not a generic food");
  const one = rebalance([], plan, GOALS, [RICE]);
  if (one.add) assert.equal(one.add.name, "White rice");
});

test("food already eaten is never what it tells you to cut", () => {
  // You cannot un-eat breakfast, and "you should have had less" is not advice.
  const eaten = [food({ name: "Fry-up", cals: 900, p: 30, c: 20, f: 70 })];
  const plan = [food({ name: "Rice", serving: 200, cals: 260, p: 5, c: 56, f: 1 })];
  const r = rebalance(eaten, plan, GOALS, [RICE]);
  if (r.cut) assert.notEqual(r.cut.name, "Fry-up");
});

test("a food not weighed in grams cannot be cut by grams", () => {
  assert.equal(perGram(food({ name: "Egg", unit: "piece", serving: 1 })), null);
  assert.equal(perGram(food({ name: "Broken", serving: 0 })), null);
  const plan = [food({ name: "Fatty pie", unit: "slice", serving: 2, cals: 1400, p: 20, c: 60, f: 120 })];
  const r = rebalance([], plan, GOALS, []);
  assert.equal(r.cut, null);
  assert.match(r.note, /by hand/);
});

test("ml is a weighable unit too", () => {
  assert.ok(perGram(food({ name: "Olive oil", unit: "ml", serving: 100, f: 100, cals: 884 })));
});

test("the macro furthest over wins, measured against its own target", () => {
  // In absolute grams carbs would win almost every time simply for being the
  // biggest number on the card.
  const plan = [food({ name: "Mixed", serving: 100, cals: 1000, p: 10, c: 370, f: 120 })];
  const r = rebalance([], plan, GOALS, []);
  assert.equal(r.over, "f", "120/80 is further over than 370/350");
  assert.equal(MACRO_NAME.f, "fat");
});

test("totals ignore junk rather than turning it into NaN", () => {
  const t = totalsOf([
    food({ name: "ok", cals: 100, p: 10, c: 5, f: 2 }),
    { name: "junk" } as FoodItem,
  ]);
  assert.equal(t.cals, 100);
  assert.ok(Number.isFinite(t.p));
});

test("a goal of zero is not a target to be over", () => {
  const noGoals = { cals: 0, protein: 0, carbs: 0, fat: 0 } as Goals;
  const r = rebalance([], [PEANUTS], noGoals, []);
  assert.equal(r.over, null);
});

test("it does not answer a carb gap with a spoonful of sugar", () => {
  // The obvious scoring — most of the missing macro per gram of the macro you
  // are over — picks pure glucose every time. It closes one gap perfectly and
  // leaves every other one exactly where it was, which is a correct answer to
  // the wrong question.
  const GLUCOSE = food({ name: "Glucose powder", cals: 400, p: 0, c: 100, f: 0 });
  const OATS = food({ name: "Oats", cals: 389, p: 16.9, c: 66.3, f: 6.9 });
  const plan = [food({ ...PEANUTS, serving: 300, cals: 1701, p: 78, c: 48, f: 147 })];
  const r = rebalance([], plan, GOALS, [GLUCOSE, OATS, CHICKEN]);
  assert.ok(r.add);
  assert.notEqual(r.add!.name, "Glucose powder");
  assert.ok(r.add!.gives.p > 0, "what it adds should do more than one job");
});

test("a suggestion never has to be the food it just told you to cut", () => {
  const plan = [food({ ...PEANUTS, serving: 300, cals: 1701, p: 78, c: 48, f: 147 })];
  const r = rebalance([], plan, GOALS, [PEANUTS, RICE]);
  if (r.add) assert.notEqual(r.add.name.toLowerCase(), "peanuts");
});
