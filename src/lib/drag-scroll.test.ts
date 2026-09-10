import assert from "node:assert/strict";
import { test } from "node:test";
import { EDGE_PX, MAX_SPEED, edgeVelocity } from "./drag-scroll.ts";

const TOP = 0;
const BOTTOM = 800;

test("the middle of the list does not scroll", () => {
  assert.equal(edgeVelocity(400, TOP, BOTTOM), 0);
  assert.equal(edgeVelocity(TOP + EDGE_PX + 1, TOP, BOTTOM), 0);
  assert.equal(edgeVelocity(BOTTOM - EDGE_PX - 1, TOP, BOTTOM), 0);
});

test("near the top it scrolls up, near the bottom it scrolls down", () => {
  assert.ok(edgeVelocity(TOP + 5, TOP, BOTTOM) < 0);
  assert.ok(edgeVelocity(BOTTOM - 5, TOP, BOTTOM) > 0);
});

test("the closer to the edge, the faster", () => {
  const shallow = Math.abs(edgeVelocity(TOP + EDGE_PX - 10, TOP, BOTTOM));
  const deep = Math.abs(edgeVelocity(TOP + 2, TOP, BOTTOM));
  assert.ok(deep > shallow, `${deep} should outrun ${shallow}`);
});

test("most of the zone is a gentle nudge, not a bolt", () => {
  // Squared ramp: halfway into the zone should be well under half speed, so
  // straying near the bottom of the screen does not fling the list.
  const half = Math.abs(edgeVelocity(TOP + EDGE_PX / 2, TOP, BOTTOM));
  assert.ok(half <= MAX_SPEED * 0.3, `${half} is too eager for halfway`);
});

test("speed is capped however far past the edge the finger goes", () => {
  assert.ok(Math.abs(edgeVelocity(-500, TOP, BOTTOM)) <= MAX_SPEED);
  assert.ok(Math.abs(edgeVelocity(5000, TOP, BOTTOM)) <= MAX_SPEED);
});

test("a container too short for two edge zones does not vibrate", () => {
  // Without clamping the zone to a third of the height, a 100px container
  // would be inside BOTH edge zones everywhere, scrolling up and down at once.
  const short = { top: 0, bottom: 100 };
  const mid = edgeVelocity(50, short.top, short.bottom);
  assert.equal(mid, 0, "the middle of a short list still holds still");
});

test("a zero-height container is not a division by zero", () => {
  assert.equal(edgeVelocity(0, 0, 0), 0);
  assert.ok(Number.isFinite(edgeVelocity(10, 50, 50)));
});
