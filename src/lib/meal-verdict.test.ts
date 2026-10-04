import assert from "node:assert/strict";
import { test } from "node:test";
import { judge } from "./meal-verdict.ts";

const DATE = "2026-10-05";
const at = (h: number, m = 0) => new Date(2026, 9, 5, h, m).getTime();
const SLOTS = [
  { label: "Breakfast", time: "08:30", planned: 800 },
  { label: "Lunch", time: "12:30", planned: 800 },
  { label: "Dinner", time: "19:30", planned: 800 },
];

test("enough in the on-time window is on time, straight away", () => {
  const v = judge(DATE, SLOTS, [{ cals: 600, eatenAt: at(8, 50) }], 9 * 60, 0);
  assert.equal(v["08:30|Breakfast"]?.status, "ontime");
  assert.equal(Object.keys(v).length, 1);
});

test("eaten after the 90 minutes but inside the window is late", () => {
  // Breakfast window runs to 11:30; on time until 10:00.
  const v = judge(DATE, SLOTS, [{ cals: 700, eatenAt: at(10, 30) }], 10 * 60 + 31, 0);
  assert.equal(v["08:30|Breakfast"]?.status, "late");
});

test("nothing, or too little, by the window's end is skipped", () => {
  const v = judge(DATE, SLOTS, [{ cals: 200, eatenAt: at(9) }], 11 * 60 + 30, 0);
  assert.equal(v["08:30|Breakfast"]?.status, "skipped");
  assert.equal(v["08:30|Breakfast"]?.kcal, 200);
  assert.equal(v["12:30|Lunch"], undefined, "lunch is still open");
});

test("food without an eaten time or from another day does not count", () => {
  const v = judge(DATE, SLOTS, [{ cals: 900 }, { cals: 900, eatenAt: new Date(2026, 9, 4, 9).getTime() }], 1440, 0);
  assert.deepEqual(Object.values(v).map((x) => x.status), ["skipped", "skipped", "skipped"]);
});
