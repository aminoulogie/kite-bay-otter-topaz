import assert from "node:assert/strict";
import { test } from "node:test";
import {
  axisForGesture, isFullyZoomedOut, panDomain, pixelToValue, zoomDomain,
} from "./chart-zoom.ts";

const full = { min: 0, max: 100 };

test("the point under the fingers stays under the fingers", () => {
  // Zooming about the view centre instead is what makes a chart feel like it
  // is fighting you: you pinch on a spike and the spike slides away.
  const before = { min: 0, max: 100 };
  const anchor = 25;
  const after = zoomDomain(before, full, 0.5, anchor);
  const tBefore = (anchor - before.min) / (before.max - before.min);
  const tAfter = (anchor - after.min) / (after.max - after.min);
  assert.ok(Math.abs(tBefore - tAfter) < 0.001, `anchor moved: ${tBefore} -> ${tAfter}`);
});

test("zooming in halves the span", () => {
  const d = zoomDomain({ min: 0, max: 100 }, full, 0.5, 50);
  assert.equal(Math.round(d.max - d.min), 50);
});

test("cannot zoom out past the data", () => {
  const d = zoomDomain({ min: 40, max: 60 }, full, 10, 50);
  assert.equal(d.min, 0);
  assert.equal(d.max, 100);
});

test("cannot zoom in past the floor", () => {
  let d = { min: 0, max: 100 };
  for (let i = 0; i < 30; i++) d = zoomDomain(d, full, 0.5, 50);
  assert.ok(d.max - d.min >= 2, `should stop at 2% of the extent, got ${d.max - d.min}`);
});

test("clamping at the edge keeps the span rather than squashing it", () => {
  // A domain that shrinks at the edge reads as the chart resisting the gesture.
  const d = zoomDomain({ min: 0, max: 20 }, full, 1, 0);
  assert.equal(Math.round(d.max - d.min), 20);
  assert.equal(d.min, 0);
});

test("panning does not change the span, and stops at the data", () => {
  const d = panDomain({ min: 40, max: 60 }, full, 1000);
  assert.equal(d.max, 100);
  assert.equal(Math.round(d.max - d.min), 20);
});

test("a horizontal pinch means time, a vertical one means value", () => {
  // Read from how the fingers are placed, not which way they move, so it is
  // the same whether spreading or pinching.
  assert.equal(axisForGesture(200, 10), "x");
  assert.equal(axisForGesture(10, 200), "y");
  assert.equal(axisForGesture(100, 90), "both");
});

test("the y axis is flipped, because screen y grows downward", () => {
  // Without this, dragging up zooms toward the wrong value.
  const top = pixelToValue(0, 0, 100, { min: 0, max: 10 }, true);
  const bottom = pixelToValue(100, 0, 100, { min: 0, max: 10 }, true);
  assert.equal(top, 10);
  assert.equal(bottom, 0);
});

test("x maps left to low without flipping", () => {
  assert.equal(pixelToValue(0, 0, 100, { min: 0, max: 10 }), 0);
  assert.equal(pixelToValue(100, 0, 100, { min: 0, max: 10 }), 10);
});

test("a reset button only shows when actually zoomed", () => {
  assert.ok(isFullyZoomedOut({ min: 0, max: 100 }, full));
  assert.ok(!isFullyZoomedOut({ min: 10, max: 60 }, full));
});
