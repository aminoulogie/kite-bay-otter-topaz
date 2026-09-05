import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRE_WINDOWS, checkPreWorkout, preTargets, suggestFoods, windowForMinutes,
} from "./preworkout.ts";

const meal = PRE_WINDOWS[0]!;
const topup = PRE_WINDOWS[2]!;

test("targets scale with bodyweight, not fixed grams", () => {
  // "40g of carbs" means different things at 60kg and 100kg.
  const light = preTargets(60, meal);
  const heavy = preTargets(100, meal);
  assert.ok(heavy.carbsG > light.carbsG * 1.5, `${heavy.carbsG} vs ${light.carbsG}`);
});

test("closer to the session means less food and tighter fat limits", () => {
  const far = preTargets(80, meal);
  const near = preTargets(80, topup);
  assert.ok(near.carbsG < far.carbsG, "less carbohydrate closer in");
  assert.ok(near.maxFatG < far.maxFatG, "and a tighter fat ceiling");
});

test("the window is picked from minutes before training", () => {
  assert.equal(windowForMinutes(180).id, "meal");
  assert.equal(windowForMinutes(90).id, "snack");
  assert.equal(windowForMinutes(30).id, "topup");
  assert.equal(windowForMinutes(10).id, "immediate");
});

test("beyond the longest window it is just a normal meal", () => {
  assert.equal(windowForMinutes(600).id, "meal");
});

test("nothing logged reads as empty, not as a failure", () => {
  const c = checkPreWorkout(undefined, preTargets(80, topup));
  assert.equal(c.verdict, "empty");
  assert.equal(c.itemCount, 0);
});

test("a heavy meal close to training is flagged as heavy", () => {
  // Fat and fibre slow gastric emptying; twenty minutes out that is the whole
  // problem, and carbohydrate hitting target does not excuse it.
  const day = {
    items: [{ meal: "Pre-Workout", c: 40, p: 10, f: 30, fiber: 9, cals: 500, name: "x", serving: 1, unit: "g" }],
  };
  const c = checkPreWorkout(day as never, preTargets(80, topup));
  assert.equal(c.verdict, "heavy");
  assert.ok(c.fatOver);
});

test("too little carbohydrate reads as light", () => {
  const day = { items: [{ meal: "Pre-Workout", c: 2, p: 1, f: 0, fiber: 0, cals: 20, name: "x", serving: 1, unit: "g" }] };
  assert.equal(checkPreWorkout(day as never, preTargets(80, topup)).verdict, "light");
});

test("only pre-workout items are counted, not the whole day", () => {
  const day = {
    items: [
      { meal: "Breakfast", c: 200, p: 50, f: 40, fiber: 20, cals: 1200, name: "b", serving: 1, unit: "g" },
      { meal: "Pre-Workout", c: 30, p: 12, f: 2, fiber: 1, cals: 190, name: "p", serving: 1, unit: "g" },
    ],
  };
  const c = checkPreWorkout(day as never, preTargets(80, topup));
  assert.equal(c.carbsG, 30, "breakfast must not count toward the pre-workout window");
  assert.equal(c.verdict, "good");
});

test("suggestions respect the window's fat and fibre ceilings", () => {
  const library = [
    { name: "Rice", c: 43, p: 4, f: 0.4, fiber: 0.6, cals: 195, serving: 100, unit: "g" },
    { name: "Peanut butter", c: 15, p: 28, f: 55, fiber: 6, cals: 690, serving: 100, unit: "g" },
  ];
  const s = suggestFoods(library as never, preTargets(80, topup));
  assert.ok(s.some((f) => f.name === "Rice"));
  assert.ok(!s.some((f) => f.name === "Peanut butter"), "55g of fat cannot suit a top-up");
});
