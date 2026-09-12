import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TAP_BACK_FRACTION, nextPhotoDate, positionIn, prevPhotoDate, tapSide,
} from "./photo-nav.ts";

const DATES = ["2026-09-01", "2026-09-04", "2026-09-09", "2026-10-02"];

test("next skips the days with nothing on them", () => {
  // The whole point: stepping a calendar day at a time is a run of dead taps
  // with an empty frame at the end of each.
  assert.equal(nextPhotoDate(DATES, "2026-09-01"), "2026-09-04");
  assert.equal(nextPhotoDate(DATES, "2026-09-04"), "2026-09-09");
  assert.equal(nextPhotoDate(DATES, "2026-09-09"), "2026-10-02", "across the month boundary");
});

test("previous does the same in reverse", () => {
  assert.equal(prevPhotoDate(DATES, "2026-10-02"), "2026-09-09");
  assert.equal(prevPhotoDate(DATES, "2026-09-04"), "2026-09-01");
});

test("the ends are hard stops, not a wrap", () => {
  // Running off December into January is disorienting in a set ordered by
  // time, and the stop is the only thing saying "that is all of them".
  assert.equal(nextPhotoDate(DATES, "2026-10-02"), null);
  assert.equal(prevPhotoDate(DATES, "2026-09-01"), null);
});

test("a day with no photo of its own still steps both ways", () => {
  // Opening an empty day to capture one is normal; the viewer must not strand
  // you there.
  assert.equal(nextPhotoDate(DATES, "2026-09-05"), "2026-09-09");
  assert.equal(prevPhotoDate(DATES, "2026-09-05"), "2026-09-04");
});

test("a day before or after everything finds the nearest end", () => {
  assert.equal(nextPhotoDate(DATES, "2020-01-01"), "2026-09-01");
  assert.equal(prevPhotoDate(DATES, "2020-01-01"), null);
  assert.equal(prevPhotoDate(DATES, "2030-01-01"), "2026-10-02");
  assert.equal(nextPhotoDate(DATES, "2030-01-01"), null);
});

test("dates in any order still navigate in time order", () => {
  const jumbled = ["2026-10-02", "2026-09-04", "2026-09-01", "2026-09-09"];
  assert.equal(nextPhotoDate(jumbled, "2026-09-01"), "2026-09-04");
  assert.equal(prevPhotoDate(jumbled, "2026-10-02"), "2026-09-09");
});

test("no photos at all navigates nowhere rather than throwing", () => {
  assert.equal(nextPhotoDate([], "2026-09-01"), null);
  assert.equal(prevPhotoDate([], "2026-09-01"), null);
  assert.deepEqual(positionIn([], "2026-09-01"), { index: null, total: 0 });
});

test("the counter counts pictures, not dates", () => {
  assert.deepEqual(positionIn(DATES, "2026-09-09"), { index: 2, total: 4 });
  assert.deepEqual(positionIn(DATES, "2026-09-01"), { index: 0, total: 4 });
});

test("a day with no photo has no position but still knows the total", () => {
  assert.deepEqual(positionIn(DATES, "2026-09-05"), { index: null, total: 4 });
});

test("duplicates are one photograph", () => {
  const dupes = ["2026-09-01", "2026-09-01", "2026-09-04"];
  assert.equal(positionIn(dupes, "2026-09-04").total, 2);
  assert.equal(nextPhotoDate(dupes, "2026-09-01"), "2026-09-04");
});

test("the left third goes back and the rest goes forward", () => {
  assert.equal(tapSide(10, 300), "prev");
  assert.equal(tapSide(200, 300), "next");
  assert.equal(tapSide(300 * TAP_BACK_FRACTION - 1, 300), "prev");
  assert.equal(tapSide(300 * TAP_BACK_FRACTION + 1, 300), "next");
});

test("a tap outside the frame is not a tap", () => {
  assert.equal(tapSide(-5, 300), null);
  assert.equal(tapSide(400, 300), null);
  assert.equal(tapSide(10, 0), null, "an unmeasured frame never navigates");
});
