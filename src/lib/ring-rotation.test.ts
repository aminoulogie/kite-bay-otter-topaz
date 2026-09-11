import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FLING_STOP, angleFrom, decay, deltaAngle, hourAtTop, radiusFrom, rotationForHour,
  velocityFrom, wrapAngle,
} from "./ring-rotation.ts";

test("every angle has one representation", () => {
  assert.equal(wrapAngle(0), 0);
  assert.equal(wrapAngle(360), 0);
  assert.equal(wrapAngle(-90), 270);
  assert.equal(wrapAngle(725), 5);
  assert.equal(wrapAngle(Number.NaN), 0);
});

test("the top of the ring is zero and angles run clockwise", () => {
  assert.equal(angleFrom(0, 0, 0, -10), 0);
  assert.equal(Math.round(angleFrom(0, 0, 10, 0)), 90);
  assert.equal(Math.round(angleFrom(0, 0, 0, 10)), 180);
  assert.equal(Math.round(angleFrom(0, 0, -10, 0)), 270);
});

test("dragging across the seam moves the short way", () => {
  // The bug this exists for: subtracting raw angles reads 359° → 1° as 358
  // degrees backwards, and the ring kicks hard the wrong way once a turn.
  assert.equal(deltaAngle(359, 1), 2);
  assert.equal(deltaAngle(1, 359), -2);
  assert.equal(deltaAngle(0, 90), 90);
  assert.equal(deltaAngle(0, 270), -90);
});

test("half a turn is the furthest anything can move in one step", () => {
  assert.ok(Math.abs(deltaAngle(0, 180)) <= 180);
  assert.ok(Math.abs(deltaAngle(0, 181)) <= 180);
});

test("distance from the centre is what decides a touch is on the ring", () => {
  assert.equal(radiusFrom(0, 0, 3, 4), 5);
  assert.equal(radiusFrom(10, 10, 10, 10), 0);
});

test("a flick slows down and then stops", () => {
  let v = 1;
  let frames = 0;
  while (v !== 0 && frames < 500) {
    v = decay(v);
    frames++;
  }
  assert.equal(v, 0, "it settles rather than spinning forever");
  assert.ok(frames < 200, `took ${frames} frames`);
});

test("settling stops rather than chasing an ever-smaller number", () => {
  assert.equal(decay(FLING_STOP / 2), 0);
  assert.equal(decay(0), 0);
  assert.ok(Math.abs(decay(-1)) > 0, "and it settles in both directions");
});

test("velocity comes from a window, not the last two points", () => {
  // Two samples a millisecond apart at the moment of release produce a
  // velocity that flings the ring clean across the screen.
  const jittery = [
    { angle: 0, t: 0 },
    { angle: 40, t: 60 },
    { angle: 41, t: 61 },
  ];
  const v = velocityFrom(jittery);
  assert.ok(v < 1, `expected a sane speed, got ${v} deg/ms`);
  assert.ok(v > 0);
});

test("a held finger has no velocity", () => {
  assert.equal(velocityFrom([{ angle: 10, t: 0 }, { angle: 10, t: 200 }]), 0);
  assert.equal(velocityFrom([{ angle: 10, t: 5 }]), 0);
  assert.equal(velocityFrom([]), 0);
});

test("velocity across the seam keeps its direction", () => {
  const v = velocityFrom([{ angle: 350, t: 0 }, { angle: 10, t: 100 }]);
  assert.ok(v > 0, "crossing midnight forwards is still forwards");
});

test("the hour at the focus mark follows the rotation", () => {
  assert.equal(hourAtTop(0), 0);
  assert.equal(hourAtTop(-90), 6, "a quarter turn is six hours");
  assert.equal(hourAtTop(-180), 12);
});

test("asking for an hour and reading it back agree", () => {
  for (const h of [0, 3, 6.5, 12, 18, 23.75]) {
    const r = rotationForHour(h);
    assert.ok(Math.abs(hourAtTop(r) - h) < 1e-9, `${h} came back as ${hourAtTop(r)}`);
  }
});

test("a day starting at six still lines its hours up", () => {
  const r = rotationForHour(9, 6);
  assert.ok(Math.abs(hourAtTop(r, 6) - 9) < 1e-9);
});
