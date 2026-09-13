import assert from "node:assert/strict";
import { test } from "node:test";
import { CAL_TOLERANCE, barHeights, summariseWeek, type WeekRow } from "./week-fuel.ts";

const day = (date: string, over: Partial<WeekRow["totals"]> = {}, logged = true): WeekRow => ({
  date,
  logged,
  totals: { cals: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: 0, ...over },
});

const GOALS = { cals: 2000, protein: 150, water: 2500 };

test("an empty week reports zeroes rather than dividing by nothing", () => {
  const w = summariseWeek([], GOALS);
  assert.equal(w.loggedDays, 0);
  assert.equal(w.avg.cals, 0);
  assert.equal(w.streak, 0);
});

test("the average is over the days that were logged, not over seven", () => {
  // Two days at 2000 is an average of 2000, not 571. Dividing by seven would
  // report a deficit nobody ran.
  const w = summariseWeek(
    [day("1", { cals: 2000 }), day("2", { cals: 2000 }), day("3", {}, false)],
    GOALS,
  );
  assert.equal(w.loggedDays, 2);
  assert.equal(w.avg.cals, 2000);
});

test("a day inside the tolerance band counts as on target", () => {
  const edge = 2000 * CAL_TOLERANCE;
  const w = summariseWeek(
    [
      day("1", { cals: 2000 }),
      day("2", { cals: 2000 + edge }),
      day("3", { cals: 2000 - edge }),
      day("4", { cals: 2000 + edge + 1 }),
    ],
    GOALS,
  );
  assert.equal(w.onTarget, 3, "the boundary is inside the band, one over is not");
});

test("protein and water are floors, so more than the goal still counts", () => {
  const w = summariseWeek(
    [day("1", { protein: 150, water: 2500 }), day("2", { protein: 400, water: 9000 })],
    GOALS,
  );
  assert.equal(w.proteinHit, 2);
  assert.equal(w.waterHit, 2);
});

test("a goal of zero never marks a day as hit", () => {
  const w = summariseWeek([day("1", { cals: 1, protein: 1, water: 1 })], {
    cals: 0, protein: 0, water: 0,
  });
  assert.equal(w.onTarget, 0);
  assert.equal(w.proteinHit, 0);
  assert.equal(w.waterHit, 0);
});

test("the streak counts back from the newest day and stops at a gap", () => {
  const rows = [day("1"), day("2", {}, false), day("3"), day("4")];
  assert.equal(summariseWeek(rows, GOALS).streak, 2);
});

test("a gap on the newest day means no streak at all", () => {
  assert.equal(summariseWeek([day("1"), day("2", {}, false)], GOALS).streak, 0);
});

test("rubbish totals read as zero rather than NaN", () => {
  const rows = [
    { date: "1", logged: true, totals: { cals: NaN, protein: -5, carbs: undefined, fat: "x", fiber: null, water: Infinity } },
  ] as unknown as WeekRow[];
  const w = summariseWeek(rows, GOALS);
  assert.equal(w.avg.cals, 0);
  assert.equal(w.avg.protein, 0);
  assert.equal(w.avg.water, 0);
});

test("bars scale against the week's own biggest day", () => {
  const h = barHeights([day("1", { cals: 1000 }), day("2", { cals: 2000 })], (t) => t.cals);
  assert.deepEqual(h, [0.5, 1]);
});

test("an unlogged day is a bar of nothing, not a gap in the row", () => {
  const h = barHeights([day("1", { cals: 2000 }), day("2", {}, false)], (t) => t.cals);
  assert.equal(h.length, 2);
  assert.equal(h[1], 0);
});

test("a week with no values does not divide by zero", () => {
  assert.deepEqual(barHeights([day("1"), day("2")], (t) => t.cals), [0, 0]);
});
