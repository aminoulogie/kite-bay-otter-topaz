import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMMIT_RATIO, LOCK_PX, REVEAL_PX, decideLock, decideRelease, offsetFor,
} from "./use-swipe-action.ts";

test("a small movement has not decided anything yet", () => {
  // The row must not twitch on contact — a tap is a few pixels of travel.
  assert.equal(decideLock(0, 0), "undecided");
  assert.equal(decideLock(-(LOCK_PX - 1), 3), "undecided");
});

test("a scroll down the diary never opens a row", () => {
  // The reported failure mode this guards: a finger dragging down a list
  // wanders sideways constantly, and every one of those must stay a scroll.
  assert.equal(decideLock(-9, 40), "scroll");
  assert.equal(decideLock(-25, 60), "scroll");
  assert.equal(decideLock(4, 30), "scroll");
});

test("a deliberate leftward flick is a swipe", () => {
  assert.equal(decideLock(-30, 4), "swipe");
  assert.equal(decideLock(-60, 20), "swipe");
});

test("swiping right does nothing, because nothing is revealed there", () => {
  assert.equal(decideLock(40, 2), "scroll");
  assert.equal(offsetFor(50), 0);
  assert.equal(offsetFor(0), 0);
});

test("the row tracks the finger exactly until it parks", () => {
  assert.equal(offsetFor(-20), 20);
  assert.equal(offsetFor(-REVEAL_PX), REVEAL_PX);
});

test("past the parked position the row gets heavier rather than stopping dead", () => {
  const past = offsetFor(-(REVEAL_PX + 100));
  assert.ok(past > REVEAL_PX, "it still moves");
  assert.ok(past < REVEAL_PX + 100, "but not one-for-one with the finger");
});

test("a graze springs shut instead of leaving a delete button open", () => {
  assert.equal(decideRelease(10, 360), "closed");
  assert.equal(decideRelease(REVEAL_PX / 2 - 1, 360), "closed");
});

test("letting go past half the button parks it open", () => {
  assert.equal(decideRelease(REVEAL_PX / 2, 360), "open");
  assert.equal(decideRelease(REVEAL_PX, 360), "open");
  assert.equal(decideRelease(150, 360), "open");
});

test("carrying the row most of the way across deletes on release", () => {
  const width = 360;
  assert.equal(decideRelease(width * COMMIT_RATIO, width), "delete");
  assert.equal(decideRelease(width - 10, width), "delete");
  // Just short of the commit point is still only open, not a delete.
  assert.equal(decideRelease(width * COMMIT_RATIO - 1, width), "open");
});

test("commit sits beyond halfway, because this deletes a real log entry", () => {
  assert.ok(COMMIT_RATIO > 0.5, "a half-hearted swipe must not destroy a meal");
});

test("an unmeasured row never deletes by accident", () => {
  // offsetWidth is 0 before layout, and `offset >= 0 * ratio` would be true for
  // every swipe — which would turn the first swipe after a render into a
  // delete. Width 0 has to fall through to the parking rules instead.
  assert.equal(decideRelease(60, 0), "open");
  assert.equal(decideRelease(1, 0), "closed");
  // The guard that matters: no width means no commit point, at any distance.
  assert.notEqual(decideRelease(9999, 0), "delete");
});
