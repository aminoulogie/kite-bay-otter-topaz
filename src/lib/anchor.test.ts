import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanOffset, locate, offsetOf, totalLength } from "./anchor.ts";

const RUNS = [10, 5, 20];

test("an offset is every character before the run", () => {
  assert.equal(offsetOf(RUNS, 0), 0);
  assert.equal(offsetOf(RUNS, 1), 10);
  assert.equal(offsetOf(RUNS, 2), 15);
  assert.equal(offsetOf(RUNS, 3), 35);
  assert.equal(offsetOf(RUNS, 99), 35, "past the end is the end");
  assert.equal(totalLength(RUNS), 35);
  assert.equal(totalLength([]), 0);
});

test("locate finds the run an offset falls in", () => {
  assert.deepEqual(locate(RUNS, 0), { index: 0, into: 0 });
  assert.deepEqual(locate(RUNS, 9), { index: 0, into: 9 });
  assert.deepEqual(locate(RUNS, 10), { index: 1, into: 0 }, "the boundary belongs to the next run");
  assert.deepEqual(locate(RUNS, 14), { index: 1, into: 4 });
  assert.deepEqual(locate(RUNS, 15), { index: 2, into: 0 });
  assert.deepEqual(locate(RUNS, 34), { index: 2, into: 19 });
});

test("an offset the chapter no longer has opens at its end, not nowhere", () => {
  // A book re-imported from a different edition, or a chapter that has been
  // edited. Landing on the last line beats refusing to open the book.
  assert.deepEqual(locate(RUNS, 35), { index: 2, into: 19 });
  assert.deepEqual(locate(RUNS, 9999), { index: 2, into: 19 });
  assert.deepEqual(locate(RUNS, -5), { index: 0, into: 0 });
  assert.deepEqual(locate([], 7), { index: 0, into: 0 });
});

test("empty runs between text are stepped over", () => {
  // A chapter's markup leaves zero-length text nodes between elements.
  assert.deepEqual(locate([0, 0, 4, 0, 3], 0), { index: 2, into: 0 });
  assert.deepEqual(locate([0, 0, 4, 0, 3], 4), { index: 4, into: 0 });
});

test("a stored offset is checked before it is trusted", () => {
  assert.equal(cleanOffset(0), 0);
  assert.equal(cleanOffset(1420), 1420);
  assert.equal(cleanOffset(12.7), 12);
  assert.equal(cleanOffset(-1), undefined);
  assert.equal(cleanOffset(NaN), undefined);
  assert.equal(cleanOffset(Infinity), undefined);
  assert.equal(cleanOffset("300"), undefined);
  assert.equal(cleanOffset(undefined), undefined);
});
