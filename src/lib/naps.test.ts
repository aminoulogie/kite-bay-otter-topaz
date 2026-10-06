import assert from "node:assert/strict";
import { test } from "node:test";
import { asNaps, napLabel, napMinutes, totalSleepHours } from "./naps.ts";

test("naps add to the night; either alone counts; nothing is null", () => {
  assert.equal(totalSleepHours({ sleep: { hours: 6 }, naps: [{ id: "a", minutes: 30, at: 0 }, { id: "b", minutes: 60, at: 0 }] }), 7.5);
  assert.equal(totalSleepHours({ naps: [{ id: "a", minutes: 45, at: 0 }] }), 0.75);
  assert.equal(totalSleepHours({ sleep: { hours: 7 } }), 7);
  assert.equal(totalSleepHours({}), null);
  assert.equal(totalSleepHours(undefined), null);
  assert.equal(napMinutes({ naps: [{ id: "a", minutes: -5, at: 0 }] }), 0);
});

test("labels and import cleaning", () => {
  assert.equal(napLabel(90), "1h 30m");
  assert.equal(napLabel(45), "45m");
  assert.equal(napLabel(120), "2h");
  assert.deepEqual(asNaps([{ id: "a", minutes: 20, at: 5 }, { id: "b", minutes: 9999 }, null]), [{ id: "a", minutes: 20, at: 5 }]);
  assert.equal(asNaps("x"), undefined);
});
