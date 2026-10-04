import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MEAL_TIMES, pace, reminders } from "./meal-pace.ts";

const GOAL = { cals: 3200, protein: 170 };

test("on the plan, every meal is its share", () => {
  const p = pace(DEFAULT_MEAL_TIMES, 7 * 60, GOAL, { cals: 0, protein: 0 });
  assert.equal(p.due, 0);
  assert.deepEqual(p.slots.map((s) => s.target), [800, 800, 480, 800, 320]);
  assert.equal(p.next?.label, "Breakfast");
});

test("a missed breakfast and lunch spread over what is left", () => {
  // 1pm, nothing eaten: 1,600 due, 3,200 left over three meals worth 15/25/10.
  const p = pace(DEFAULT_MEAL_TIMES, 13 * 60, GOAL, { cals: 0, protein: 0 });
  assert.equal(p.due, 1600);
  assert.equal(p.behind, 1600);
  assert.equal(p.next?.label, "Snack");
  assert.deepEqual(p.slots.filter((s) => !s.past).map((s) => s.target), [960, 1600, 640]);
});

test("ahead of the plan makes later meals smaller", () => {
  const p = pace(DEFAULT_MEAL_TIMES, 13 * 60, GOAL, { cals: 2000, protein: 100 });
  assert.equal(p.behind, -400);
  assert.equal(p.slots.filter((s) => !s.past).reduce((a, s) => a + s.target, 0), 1200);
});

test("reminders skip today's past meals and nothing once the goal is met", () => {
  const now = new Date(2026, 9, 5, 13, 0);
  const r = reminders(DEFAULT_MEAL_TIMES, now, GOAL, { cals: 0, protein: 0 }, 2);
  assert.deepEqual(r.filter((x) => x.id.startsWith("0-")).map((x) => x.title), ["Snack time 🍽️", "Dinner time 🍽️", "Evening time 🍽️"]);
  assert.match(r[0]!.body, /960 kcal/);
  assert.match(r[0]!.body, /behind/);
  assert.equal(r.filter((x) => x.id.startsWith("1-")).length, 5);
  const full = reminders(DEFAULT_MEAL_TIMES, now, GOAL, { cals: 3300, protein: 180 }, 1);
  assert.equal(full.length, 0);
});
