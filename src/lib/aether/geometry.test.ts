import assert from "node:assert/strict";
import { test } from "node:test";
import {
  centroidSize, craniovertebralAngle, dist, lineAngleVsHorizontal, procrustesDistance,
  robustMidlineX, unitCentered, type Pt,
} from "./geometry.ts";

/**
 * The geometry behind every face number, ported from Aether.
 *
 * These are pinned here rather than trusted because they are the layer where a
 * wrong sign or a swapped axis produces a plausible-looking number instead of
 * an error — and a plausible-looking asymmetry figure is exactly the thing
 * this app must not invent.
 */

/**
 * Mirror across a midline AND swap each L/R pair, which is what analyzeFace
 * does before comparing. Points arrive as [L0, R0, L1, R1, ...].
 *
 * The relabel is not optional. Procrustes alignment recovers rotation and
 * scale but NOT reflection, so mirroring alone leaves every pair swapped
 * relative to the original and a perfectly even face reads as lopsided.
 */
function reflectRelabel(pairs: Pt[], midlineX: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const L = pairs[i]!;
    const R = pairs[i + 1]!;
    out.push({ x: 2 * midlineX - R.x, y: R.y }, { x: 2 * midlineX - L.x, y: L.y });
  }
  return out;
}

test("a perfectly even shape reflect-relabelled onto itself is zero", () => {
  // The identity case for the whole evenness measure.
  const pts: Pt[] = [
    { x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 },
    { x: 0.4, y: 0.6 }, { x: 0.6, y: 0.6 },
  ];
  assert.ok(procrustesDistance(reflectRelabel(pts, 0.5), pts) < 1e-9);
});

test("mirroring WITHOUT relabelling is not zero, which is why the relabel exists", () => {
  // Guards the specific mistake: Procrustes recovers rotation and scale but not
  // reflection, so a plain mirror leaves every pair swapped and a symmetric
  // face measures as asymmetric.
  const pts: Pt[] = [
    { x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 },
    { x: 0.4, y: 0.6 }, { x: 0.6, y: 0.6 },
  ];
  const mirroredOnly = pts.map((p) => ({ x: 1 - p.x, y: p.y }));
  assert.ok(procrustesDistance(mirroredOnly, pts) > 0.01);
});

test("a lopsided face survives the relabel as lopsided", () => {
  const skewed: Pt[] = [
    { x: 0.40, y: 0.30 }, { x: 0.63, y: 0.34 },
    { x: 0.42, y: 0.60 }, { x: 0.60, y: 0.60 },
  ];
  assert.ok(procrustesDistance(reflectRelabel(skewed, 0.5), skewed) > 0.01);
});

test("Procrustes ignores size and position, which is the point of it", () => {
  // Two photos at different distances must not read as different faces.
  const pts: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
  const bigger = pts.map((p) => ({ x: p.x * 3 + 5, y: p.y * 3 - 2 }));
  assert.ok(procrustesDistance(bigger, pts) < 1e-9);
});

test("a genuinely lopsided shape is not zero", () => {
  const even: Pt[] = [{ x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.5, y: 0.7 }];
  const skewed: Pt[] = [{ x: 0.4, y: 0.3 }, { x: 0.62, y: 0.34 }, { x: 0.5, y: 0.7 }];
  assert.ok(procrustesDistance(skewed, even) > 0.01);
});

test("centroid size is scale, and unit-centring removes it", () => {
  const pts: Pt[] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }];
  assert.ok(centroidSize(pts) > 0);
  const unit = unitCentered(pts);
  const cx = unit.reduce((s, p) => s + p.x, 0) / unit.length;
  assert.ok(Math.abs(cx) < 1e-9, "centred on the origin");
  assert.ok(Math.abs(Math.hypot(...unit.map((p) => Math.hypot(p.x, p.y))) - 1) < 1e-9);
});

test("the midline is a median, so one stray landmark cannot drag it", () => {
  // A robust midline is the whole reason a single mis-detected point does not
  // shift every asymmetry figure on the card.
  const clean = robustMidlineX([{ x: 0.50, y: 0 }, { x: 0.51, y: 0 }, { x: 0.49, y: 0 }]);
  const withOutlier = robustMidlineX([
    { x: 0.50, y: 0 }, { x: 0.51, y: 0 }, { x: 0.49, y: 0 }, { x: 0.95, y: 0 }, { x: 0.50, y: 0 },
  ]);
  assert.ok(Math.abs(clean - 0.5) < 0.02);
  assert.ok(Math.abs(withOutlier - 0.5) < 0.02, "the 0.95 outlier did not move it");
});

test("no points at all is the centre, not a crash", () => {
  assert.equal(robustMidlineX([]), 0.5);
});

test("CVA is measured from the horizontal, and a stacked head is near 90", () => {
  // Tragus directly above C7 is a stacked neck: the angle to the horizontal is
  // 90. Forward of it, the angle drops — which is the direction the whole
  // forward-head reading depends on.
  const c7: Pt = { x: 0.5, y: 0.8 };
  const stacked = craniovertebralAngle({ x: 0.5, y: 0.4 }, c7);
  assert.ok(Math.abs(stacked - 90) < 0.001);

  const forward = craniovertebralAngle({ x: 0.75, y: 0.4 }, c7);
  assert.ok(forward < stacked, "a head further forward reads lower, not higher");
  assert.ok(forward > 45 && forward < 90);
});

test("a level line is zero degrees and the sign follows the screen's y-axis", () => {
  assert.equal(lineAngleVsHorizontal({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }), 0);
  // y grows downward in image space, so a point lower on screen is a positive
  // angle here. Getting this backwards flips every tilt reading.
  assert.ok(lineAngleVsHorizontal({ x: 0, y: 0.4 }, { x: 1, y: 0.6 }) > 0);
});

test("distance is 3D when z is there and 2D when it is not", () => {
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(dist({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }), 2);
});
