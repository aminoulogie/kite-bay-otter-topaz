import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatRest, hasElapsed, restProgress, secondsLeft, tickMs,
} from "./rest-timer.ts";

const T0 = 1_700_000_000_000;

test("no timer running is zero, not a crash", () => {
  assert.equal(secondsLeft(null, T0), 0);
  assert.equal(hasElapsed(null, T0), false);
  assert.equal(restProgress(null, 90, T0), 0);
  assert.equal(tickMs(null), null, "an idle tab must not tick");
});

test("the countdown is read from the clock, not counted down", () => {
  // This is why locking the phone never broke the number: nothing accumulates.
  assert.equal(secondsLeft(T0 + 90_000, T0), 90);
  assert.equal(secondsLeft(T0 + 90_000, T0 + 30_000), 60);
  assert.equal(secondsLeft(T0 + 90_000, T0 + 89_500), 1);
});

test("a deadline long gone reads as finished, not as a negative", () => {
  // The real case: the tab was frozen for two minutes with the screen off.
  assert.equal(secondsLeft(T0 + 90_000, T0 + 300_000), 0);
  assert.equal(hasElapsed(T0 + 90_000, T0 + 300_000), true);
  assert.equal(restProgress(T0 + 90_000, 90, T0 + 300_000), 1);
});

test("the moment it lands counts as elapsed", () => {
  assert.equal(hasElapsed(T0, T0), true);
  assert.equal(hasElapsed(T0, T0 - 1), false);
});

test("progress cannot divide by a zero duration", () => {
  assert.equal(restProgress(T0 + 1000, 0, T0), 0);
  assert.ok(Number.isFinite(restProgress(T0 + 1000, 0, T0)));
});

test("progress runs forward from nothing to full", () => {
  assert.equal(restProgress(T0 + 90_000, 90, T0), 0);
  assert.ok(Math.abs(restProgress(T0 + 90_000, 90, T0 + 45_000) - 0.5) < 0.02);
  assert.equal(restProgress(T0 + 90_000, 90, T0 + 90_000), 1);
});

test("rest is spoken in minutes and seconds", () => {
  assert.equal(formatRest(90), "1:30");
  assert.equal(formatRest(45), "0:45");
  assert.equal(formatRest(0), "0:00");
  assert.equal(formatRest(600), "10:00");
  assert.equal(formatRest(-5), "0:00");
});

test("a running timer ticks once a second, not four times", () => {
  assert.equal(tickMs(T0 + 90_000), 1000);
});
