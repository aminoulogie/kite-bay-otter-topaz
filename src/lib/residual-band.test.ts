import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_POINTS, bandNote, confidenceOf, fitLine, residualBand, residualSd,
} from "./residual-band.ts";

const DAY = 86400000;
const T0 = Date.parse("2026-01-01T12:00:00Z");

/** n points, `days` apart, on a straight line, with an optional wobble. */
function series(n: number, step: number, wobble: (i: number) => number = () => 0) {
  return Array.from({ length: n }, (_, i) => ({
    t: T0 + i * DAY * 7,
    v: 100 + i * step + wobble(i),
  }));
}

test("a straight line has a slope and no scatter", () => {
  const pts = series(10, 2);
  const fit = fitLine(pts)!;
  assert.ok(fit.slope > 0);
  assert.ok(Math.abs(residualSd(pts, fit)) < 1e-9);
});

test("two points define a line exactly, and that is not precision", () => {
  // n-2 degrees of freedom: with two points the residuals are zero by
  // construction, and a band drawn from them would claim perfect certainty.
  const pts = series(2, 5);
  assert.equal(residualSd(pts, fitLine(pts)!), 0);
});

test("a series measured on one day has no slope rather than an infinite one", () => {
  const pts = [
    { t: T0, v: 100 },
    { t: T0, v: 110 },
    { t: T0, v: 105 },
  ];
  const fit = fitLine(pts)!;
  assert.equal(fit.slope, 0);
  assert.ok(Number.isFinite(fit.intercept));
});

test("nothing is drawn below medium confidence", () => {
  // The whole point: three readings over ten days have a residual spread
  // arithmetically, and drawing it dresses noise up as a measured range.
  const pts = series(10, 2, (i) => (i % 2 ? 3 : -3));
  assert.equal(residualBand(pts, "none"), null);
  assert.equal(residualBand(pts, "low"), null);
  assert.ok(residualBand(pts, "medium"));
  assert.ok(residualBand(pts, "high"));
});

test("a band needs enough points to mean anything", () => {
  const few = series(MIN_POINTS - 1, 2, (i) => (i % 2 ? 2 : -2));
  assert.equal(residualBand(few, "high"), null);
  const enough = series(MIN_POINTS, 2, (i) => (i % 2 ? 2 : -2));
  assert.ok(residualBand(enough, "high"));
});

test("a perfectly consistent lifter gets no band, not a zero-width one", () => {
  assert.equal(residualBand(series(12, 2), "high"), null);
});

test("the band is symmetric about the fit and widens with the scatter", () => {
  const tight = residualBand(series(12, 2, (i) => (i % 2 ? 1 : -1)), "high")!;
  const loose = residualBand(series(12, 2, (i) => (i % 2 ? 8 : -8)), "high")!;
  assert.ok(loose.sd > tight.sd * 3);
  for (const p of tight.points) {
    assert.ok(Math.abs(p.hi - p.fit - (p.fit - p.lo)) < 0.02, "symmetric");
    assert.deepEqual(p.range, [p.lo, p.hi]);
  }
});

test("junk readings never reach the fit", () => {
  const pts = [
    ...series(8, 2, (i) => (i % 2 ? 2 : -2)),
    { t: Number.NaN, v: 200 },
    { t: T0, v: Number.POSITIVE_INFINITY },
  ];
  const band = residualBand(pts, "high")!;
  assert.ok(band);
  assert.ok(band.points.every((p) => Number.isFinite(p.lo) && Number.isFinite(p.hi)));
});

test("points arrive in whatever order and come back in time order", () => {
  const pts = [...series(10, 2, (i) => (i % 2 ? 2 : -2))].reverse();
  const band = residualBand(pts, "high")!;
  for (let i = 1; i < band.points.length; i++) {
    assert.ok(band.points[i]!.t > band.points[i - 1]!.t);
  }
});

test("confidence matches the thresholds the projections use", () => {
  assert.equal(confidenceOf([]), "none");
  assert.equal(confidenceOf(series(3, 1).slice(0, 2)), "none");
  // Three points inside a fortnight is not a trend.
  assert.equal(confidenceOf([{ t: T0 }, { t: T0 + DAY }, { t: T0 + 10 * DAY }]), "none");
  assert.equal(confidenceOf([{ t: T0 }, { t: T0 + DAY }, { t: T0 + 20 * DAY }]), "low");
  assert.equal(confidenceOf([{ t: T0 }, { t: T0 + DAY }, { t: T0 + 60 * DAY }]), "medium");
  assert.equal(confidenceOf([{ t: T0 }, { t: T0 + DAY }, { t: T0 + 200 * DAY }]), "high");
});

test("the band always explains itself", () => {
  const band = residualBand(series(12, 2, (i) => (i % 2 ? 2 : -2)), "high")!;
  const note = bandNote(band, "kg")!;
  assert.match(note, /±/);
  assert.match(note, /kg/);
  assert.match(note, /not a forecast/);
  assert.equal(bandNote(null, "kg"), null);
});
