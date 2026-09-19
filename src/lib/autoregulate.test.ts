import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASE_ANCHOR, DEBT_THRESHOLD_HOURS, LIMITER_FAILURE_CAP, MIN_DELOAD_SETS,
  OVER_MRV_READINESS, READINESS_FLOOR, capForVolume, deloadSetCount,
  failureFromQuality, feederAdjustment, feederRamp, mesoAnchor, readinessWithSleepDebt,
  rpeFromQuality,
} from "./autoregulate.ts";

test("an unrated set says nothing rather than guessing a 3", () => {
  assert.equal(failureFromQuality({}), null);
  assert.equal(failureFromQuality({ limiter: "target" }), null);
});

test("reaching the point of no more reps is the target, not a 5", () => {
  // The bug this encodes: mapping `nothing` to 5 made the ladder answer every
  // genuinely hard set with "hold the load", so training hard capped progress.
  assert.equal(failureFromQuality({ closeness: "nothing", limiter: "target" }), 3);
  assert.equal(failureFromQuality({ closeness: "forced", limiter: "target" }), 5);
  assert.equal(failureFromQuality({ closeness: "one_left", limiter: "target" }), 2);
  assert.equal(failureFromQuality({ closeness: "reps_left", limiter: "target" }), 1);
});

test("a set the triceps ended is not evidence the chest failed", () => {
  assert.equal(failureFromQuality({ closeness: "forced", limiter: "synergist" }), LIMITER_FAILURE_CAP);
  assert.equal(failureFromQuality({ closeness: "nothing", limiter: "form" }), LIMITER_FAILURE_CAP);
  // The cap only ever lowers: an easy set stopped by form is still easy.
  assert.equal(failureFromQuality({ closeness: "reps_left", limiter: "form" }), 1);
});

test("the survey maps onto numeric RPE", () => {
  assert.equal(rpeFromQuality({ closeness: "forced" }), 10.5);
  assert.equal(rpeFromQuality({ closeness: "nothing" }), 10);
  assert.equal(rpeFromQuality({ closeness: "one_left" }), 9);
  assert.equal(rpeFromQuality({ closeness: "reps_left" }), 8);
  assert.equal(rpeFromQuality({}), null);
});

test("a feeder reads one RPE lower — over 8 is an error, not a PR", () => {
  assert.equal(rpeFromQuality({ closeness: "reps_left" }, "feeder"), 7);
});

test("the feeder ramp rounds to the bar's own increment", () => {
  const r = feederRamp(100, "kg");
  assert.deepEqual(
    r.map((s) => s.weight),
    [50, 70, 87.5],
  );
  assert.equal(r[2]!.targetRpe, 8);
  assert.equal(feederRamp(100, "lb")[0]!.weight, 50);
});

test("feeder 3 moves the working target, and 7-8 leaves it alone", () => {
  assert.equal(feederAdjustment(9.5), -5);
  assert.equal(feederAdjustment(10), -5);
  assert.equal(feederAdjustment(6), 5);
  assert.equal(feederAdjustment(7), 0);
  assert.equal(feederAdjustment(8), 0);
  assert.equal(feederAdjustment(null), 0);
});

test("being past MRV drops a lift into the hold band", () => {
  assert.equal(capForVolume(100, true), OVER_MRV_READINESS);
  assert.ok(OVER_MRV_READINESS < 70, "it has to land inside the wrapper's hold band");
  assert.equal(capForVolume(100, false), 100);
  assert.equal(capForVolume(null, false), null);
  // With nothing else known, the volume fact alone is enough to hold.
  assert.equal(capForVolume(null, true), OVER_MRV_READINESS);
});

test("the volume cap never raises a worse figure", () => {
  assert.equal(capForVolume(20, true), 20);
  assert.equal(capForVolume(69, true), 69);
});

test("sleep debt scales readiness down, and only past the threshold", () => {
  assert.equal(readinessWithSleepDebt(100, DEBT_THRESHOLD_HOURS - 0.1), 100);
  assert.equal(readinessWithSleepDebt(100, DEBT_THRESHOLD_HOURS), 85);
  assert.equal(readinessWithSleepDebt(80, 20), 68);
});

test("no amount of debt reports a lifter as incapable", () => {
  assert.equal(readinessWithSleepDebt(5, 30), READINESS_FLOOR);
  assert.ok(readinessWithSleepDebt(12, 30)! >= READINESS_FLOOR);
});

test("feeling rested is not a fact the debt can be argued away with", () => {
  // Every knob in this file is one-directional. Nothing here returns a figure
  // above what it was handed.
  for (const r of [10, 40, 70, 100]) {
    assert.ok(readinessWithSleepDebt(r, 12)! <= r);
    assert.ok((capForVolume(r, true) ?? 0) <= r);
  }
});

test("nothing known stays nothing known", () => {
  assert.equal(readinessWithSleepDebt(null, 30), null);
});

test("a deload halves the sets, rounding up", () => {
  assert.equal(deloadSetCount(4), 2);
  assert.equal(deloadSetCount(5), 3);
  assert.equal(deloadSetCount(3), 2, "three halving to one would be a skipped session");
  assert.equal(deloadSetCount(9), 5);
});

test("a deload is never fewer than two sets", () => {
  assert.equal(deloadSetCount(1), MIN_DELOAD_SETS);
  assert.equal(deloadSetCount(0), MIN_DELOAD_SETS);
  assert.equal(deloadSetCount(-3), MIN_DELOAD_SETS);
  assert.equal(deloadSetCount(NaN), MIN_DELOAD_SETS);
});

test("a programme's own anchor wins, and anything else falls back", () => {
  assert.equal(mesoAnchor({ anchor: "2026-01-05" }), "2026-01-05");
  assert.equal(mesoAnchor(null), BASE_ANCHOR);
  assert.equal(mesoAnchor(undefined), BASE_ANCHOR);
  assert.equal(mesoAnchor({}), BASE_ANCHOR);
  // A malformed anchor must not re-phase every week that has already happened.
  assert.equal(mesoAnchor({ anchor: "last tuesday" }), BASE_ANCHOR);
  assert.equal(mesoAnchor({ anchor: "2026-1-5" }), BASE_ANCHOR);
});
