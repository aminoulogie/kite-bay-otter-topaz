import assert from "node:assert/strict";
import { test } from "node:test";
import { depthSymmetry, type DepthGrid } from "./depthmap.ts";

const W = 120, H = 134, C = 1.5, X0 = -90, Y0 = -120;

/** A face-like surface, symmetric about x = midline, with optional extras. */
function surface(opts: { midline?: number; tilt?: number; leftCheek?: number } = {}): DepthGrid {
  const m = opts.midline ?? 0;
  const z = new Float32Array(W * H).fill(NaN);
  for (let j = 0; j < H; j++) {
    const y = Y0 + (j + 0.5) * C;
    for (let i = 0; i < W; i++) {
      const x = X0 + (i + 0.5) * C;
      const dx = x - m;
      if (dx * dx / 70 ** 2 + (y + 20) ** 2 / 95 ** 2 > 1) continue; // oval face
      let v = 60 - (dx * dx) / 80 - ((y + 20) * (y + 20)) / 200;
      v += (opts.tilt ?? 0) * dx; // head turned a little
      // A fuller cheek on the person's LEFT (x > midline), mid-face.
      if (opts.leftCheek && dx > 0) v += opts.leftCheek * Math.exp(-(((dx - 40) ** 2) + (y + 20) ** 2) / (2 * 12 ** 2));
      z[j * W + i] = v;
    }
  }
  return { z, width: W, height: H, cellMm: C, originMm: [X0, Y0] };
}

test("a symmetric surface reads ~0 mm", () => {
  const s = depthSymmetry(surface())!;
  assert.ok(s.rmsMm < 0.05, `rms ${s.rmsMm}`);
});

test("an off-centre midline is found, not read as asymmetry", () => {
  const s = depthSymmetry(surface({ midline: 3 }))!;
  assert.ok(Math.abs(s.midlineMm - 3) <= 0.5, `midline ${s.midlineMm}`);
  assert.ok(s.rmsMm < 0.3, `rms ${s.rmsMm}`);
});

test("a slight leftover head turn is removed, not read as asymmetry", () => {
  const s = depthSymmetry(surface({ tilt: 0.06 }))!;
  assert.ok(s.rmsMm < 0.1, `rms ${s.rmsMm}`);
  assert.ok(Math.abs(s.residualYawDeg) > 1, `yaw ${s.residualYawDeg}`);
});

test("a fuller left cheek shows up, in the middle third, on the left", () => {
  const s = depthSymmetry(surface({ leftCheek: 3 }))!;
  assert.ok(s.rmsMm > 0.2, `rms ${s.rmsMm}`);
  assert.ok(s.leftMinusRightMm.middle > 0.2, `middle ${s.leftMinusRightMm.middle}`);
  assert.ok(s.byThird.middle > s.byThird.upper, "the difference sits mid-face");
});

test("too little data gives no reading", () => {
  const empty: DepthGrid = { z: new Float32Array(W * H).fill(NaN), width: W, height: H, cellMm: C, originMm: [X0, Y0] };
  assert.equal(depthSymmetry(empty), null);
});
