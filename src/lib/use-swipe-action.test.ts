import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMMIT_RATIO, CONFIRM_PX, CONFIRM_RATIO, LOCK_PX, REVEAL_PX, decideLock,
  decideRelease, offsetFor,
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

// ------------------------------------------------------- the confirm side --

test("a row with nothing on the right still refuses to move that way", () => {
  // Every row in the app that is not a planned meal: sliding towards an empty
  // side reads as the row having come loose.
  assert.equal(decideLock(40, 2), "scroll");
  assert.equal(offsetFor(50), 0);
});

test("a row that can be confirmed swipes both ways", () => {
  assert.equal(decideLock(-30, 4, true), "swipe");
  assert.equal(decideLock(30, 4, true), "swipe");
  // But a scroll is still a scroll, whichever way it drifts.
  assert.equal(decideLock(20, 45, true), "scroll");
  assert.equal(decideLock(-20, 45, true), "scroll");
});

test("rightward travel reports negative, so the two directions cannot be confused", () => {
  const right = offsetFor(60, true);
  assert.ok(right < 0, "confirm side is negative");
  assert.ok(offsetFor(-60) > 0, "delete side is positive");
});

test("the confirm side is heavier than the finger", () => {
  // No parked position to arrive at, so the resistance is the only landmark.
  assert.ok(Math.abs(offsetFor(100, true)) < 100);
  assert.ok(Math.abs(offsetFor(100, true)) > 0);
});

test("a short push right springs back rather than confirming", () => {
  assert.equal(decideRelease(-10, 360), "closed");
  assert.equal(decideRelease(-(CONFIRM_PX - 1), 360), "closed");
});

test("carrying the row right past the bar confirms it", () => {
  assert.equal(decideRelease(-CONFIRM_PX, 360), "confirm");
  assert.equal(decideRelease(-200, 360), "confirm");
});

test("on a narrow row the bar is a share of the width, not a fixed distance", () => {
  // 96px on a 200px row would be almost half the row; the ratio takes over
  // so the gesture stays proportionate on a small screen.
  const narrow = 200;
  assert.equal(decideRelease(-(narrow * CONFIRM_RATIO), narrow), "confirm");
  assert.equal(decideRelease(-(narrow * CONFIRM_RATIO - 1), narrow), "closed");
});

test("confirming asks for less travel than deleting", () => {
  // Confirming flips a flag you can flip back; deleting destroys a logged
  // entry. They are not the same size of decision.
  assert.ok(CONFIRM_RATIO < COMMIT_RATIO);
});

test("an unmeasured row never confirms by accident either", () => {
  assert.equal(decideRelease(-10, 0), "closed");
  assert.equal(decideRelease(-CONFIRM_PX, 0), "confirm");
});
